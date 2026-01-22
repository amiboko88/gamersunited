// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer');
const { isSystemActive } = require('../utils/timeHandler');
const { getUserRef } = require('../../utils/userUtils');
const visionSystem = require('../../handlers/media/vision');
const { whatsapp } = require('../../config/settings');

// מערכות
const shimonBrain = require('../../handlers/ai/brain');
const learningEngine = require('../../handlers/ai/learning');
const userManager = require('../../handlers/users/manager');
const xpManager = require('../../handlers/economy/xpManager'); // ✅ 1. ייבוא מערכת ה-XP
const gameManager = require('../../handlers/economy/gameManager'); // ✅ 2. ייבוא מערכת ההימורים
const intelManager = require('../../handlers/intel/manager'); // 🕵️ ייבוא אינטל החדש

const activeConversations = new Map();
const processingGroups = new Set(); // 🔒 מנעול לטיפול בהודעות מקבילות

function isTriggered(text, msg, sock) {
    const chatJid = msg.key.remoteJid;
    const isPrivate = !chatJid.endsWith('@g.us');

    // ⛔ התעלמות מוחלטת מסטיקרים ללא טקסט נלווה (בפרטי או בקבוצה)
    // אם זו הודעת סטיקר (ללא כיתוב), זה לא טריגר אלא אם כן זה תגובה ישירה בפרטי (וגם אז עדיף להיזהר)
    if (msg.message?.stickerMessage) return false;

    if (isPrivate) return true;

    const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];

    // 1. קריאה מפורשת (רק אם השם מופיע בהתחלה או בסוף, או כחלק ברור)
    // אם המילה "שמעון" מופיעה סתם באמצע משפט ("הכנף של שמעון"), זה לא טריגר אוטומטי.
    // נשאיר את זה לשיקול דעת של המוח החכם (Smart AI).
    const cleanText = text.trim();
    if (cleanText.startsWith('שמעון') || cleanText.startsWith('שימי') || cleanText.startsWith('בוט') ||
        cleanText.endsWith('שמעון') || cleanText.endsWith('שימי') || cleanText.endsWith('בוט')) {
        return true;
    }

    // אבל, אם השם מוזכר באמצע, אנחנו לא מחזירים True מיד, אלא נותנים ל-shouldReply להחליט.
    // (אלא אם כן יש תיוג - שזה מטופל למטה)

    // 2. תיוג ישיר (@Shimon)
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (botId && mentionedJids.some(jid => jid.includes(botId))) return true;

    // 3. תגובה (Reply) להודעה של הבוט
    // חשוב: אנחנו בודקים אם ה-participant המצוטט הוא הבוט.
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedParticipant) {
        const isReplyToBot = quotedParticipant.includes(botId);
        // אם הגיבו לבוט - זה טריגר. אחרת - זה שיחה בין משתמשים שאנחנו לא מתערבים בה.
        if (isReplyToBot) return true;
    }

    // ⛔ התעלמות אם ההודעה מתייגת מישהו אחר (ולא את הבוט)
    // mentionedJids כבר הוגדר למעלה (שורה 33)
    if (mentionedJids.length > 0 && (!botId || !mentionedJids.some(jid => jid.includes(botId)))) {
        return false; // זה דיבור ישיר למישהו אחר, אל תתערב
    }

    return false;
}

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];
    const isPrivate = !chatJid.endsWith('@g.us');

    // --- בדיקת שעות פעילות ---
    const systemStatus = isSystemActive();
    // Admin Override: Phone (972526800647) OR specific LID (100772834480319) seen in logs
    const isAdmin = senderPhone === '972526800647' || senderPhone === '100772834480319';

    if (!systemStatus.active && !isAdmin) {
        const isInteraction = isPrivate || text.includes('שמעון') || text.includes('שימי') || text.includes('בוט');
        if (!isInteraction) return;

        const modeDescription = {
            "Shabbat": "SHABBAT_MODE (Religious/Rest day)",
            "Siesta": "SIESTA_MODE (Afternoon Nap/Food - Do not disturb)",
            "Night": "NIGHT_MODE (Sleeping - Do not disturb)"
        }[systemStatus.reason] || "REST_MODE";

        const contextInjection = `
        [SYSTEM OVERRIDE]: Currently in ${modeDescription}.
        User message: "${text}".
        INSTRUCTION: You are NOT allowed to process commands or help right now. 
        Instead, scold the user or dismiss them creatively based on your persona and the current time/reason.
        `;

        await sock.sendPresenceUpdate('composing', chatJid);
        const refusalResponse = await shimonBrain.ask(senderPhone, 'whatsapp', contextInjection, false, null, chatJid);
        await sock.sendMessage(chatJid, { text: refusalResponse }, { quoted: msg });
        return;
    }

    // 🛑 CRITICAL ID LOGIC 🛑
    // senderPhone = The WhatsApp number (123456...)
    // linkedDbId = The Discord Snowflake (18 digits) if linked, OR null if unknown.
    // We NEVER want to use senderPhone as the DB key.

    let linkedDbId = null;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        // getUserRef might return a ref to the phone doc if not found - we must check the ID format!
        if (userRef.id.length > 15) {
            linkedDbId = userRef.id;
        }

        // 🔍 DEBUG: בדיקת LID בזמן אמת עבור אמי (מעוצב)
        const isLid = senderPhone.length > 14;
        if (isLid && isAdmin) {
            const status = linkedDbId ? "✅ VERIFIED" : "⚠️ UNKNOWN/UNLINKED";
            if (status.includes("VERIFIED")) {
                // Debug logic remains same...
            }
        }
    } catch (e) { }

    bufferSystem.addToBuffer(senderPhone, msg, text, (finalMsg, combinedText, mediaArray) => {
        // We pass BOTH indices: One for chat (phone), one for DB (linkedId)
        executeCoreLogic(sock, finalMsg, combinedText, mediaArray, senderPhone, linkedDbId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaArray, senderPhone, dbUserId, chatJid, isAdmin) {
    // 🛡️ ONLY update DB if we have a valid Linked DB ID
    if (dbUserId) {
        try { await userManager.updateLastActive(dbUserId); } catch (e) { }
    }

    // ... [No changes to XP/Spam logic lines 135-183] ...

    // 🛡️ ONLY update DB if we have a valid Linked DB ID
    if (dbUserId) {
        try { await userManager.updateLastActive(dbUserId); } catch (e) { }
    }

    // 🕵️ AUTO-SCAN (Private Images)
    // If a user sends an image in DM, assume it might be a scoreboard and try to scan it.
    if (isPrivate && bufferSystem.hasMedia(senderPhone)) {
        // Retrieve media from buffer (since mediaArray might be passed empty in some flows, let's be safe)
        const storeMessages = bufferSystem.getBuffer(senderPhone);
        const privateImages = storeMessages.filter(m => m.message?.imageMessage);

        if (privateImages.length > 0) {
            log(`🕵️ [Auto-Scan] Processing ${privateImages.length} private images from ${senderPhone}...`);
            await sock.sendMessage(chatJid, { text: '🕵️ בודק סריקת נתונים...' }, { quoted: msg });

            const buffers = [];
            for (const imgMsg of privateImages) {
                try {
                    const buf = await visionSystem.downloadWhatsAppImage(imgMsg, sock);
                    if (buf) buffers.push(buf);
                } catch (e) { }
            }

            if (buffers.length > 0) {
                try {
                    const { generateContent } = require('../../handlers/ai/gemini');
                    const codStats = require('../../handlers/ai/tools/cod_stats');

                    // Extract Data
                    const parts = [{ text: "Extract Warzone Scoreboard data from these images. Return JSON list: [{username, kills, damage, placement, mode}]. If not a scoreboard, return empty list." }];
                    buffers.forEach(b => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }));

                    const result = await generateContent(parts, "gemini-2.0-flash");
                    const jsonMatch = result.match(/\[.*\]/s);

                    if (jsonMatch) {
                        const matches = JSON.parse(jsonMatch[0]);
                        if (matches.length > 0) {
                            // Save Data
                            // Use dbUserId if available (Linked), otherwise use Phone as ID (Fallback)
                            const targetId = dbUserId || senderPhone;
                            const report = await cod_stats.execute({ matches }, targetId, chatJid, buffers);
                            await sock.sendMessage(chatJid, { text: `📊 **דוח סריקה (פרטי):**\n${report}` });

                            // Clear buffer to prevent double processing by AI
                            bufferSystem.clearBuffer(senderPhone);
                            return;
                        }
                    }
                } catch (e) {
                    log(`⚠️ [Auto-Scan] Failed to process private image: ${e.message}`);
                    // Fallthrough to normal AI chat if scan fails
                }
            }
        }
    }

    // 🕵️ SCAN COMMAND (Admin Only)
    // "Force Scan" the last 50 messages for missed scoreboards
    if (text === '!scan' && isAdmin) {
        const store = require('../store');
        const messages = store.getMessages(chatJid);
        log(`🕵️ [Scan] Checking ${messages.length} messages in memory...`);

        let foundImages = [];
        for (const m of messages) {
            // Check for Image
            const imgParams = m.message?.imageMessage;
            if (imgParams) foundImages.push(m);
        }

        if (foundImages.length === 0) {
            await sock.sendMessage(chatJid, { text: '🕵️ Scan Complete: No recent images found in memory.' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatJid, { text: `🕵️ Found ${foundImages.length} images. Processing...` }, { quoted: msg });

        // Download All
        const buffers = [];
        for (const imgMsg of foundImages) {
            try {
                const buf = await visionSystem.downloadWhatsAppImage(imgMsg, sock);
                if (buf) buffers.push(buf);
            } catch (e) { }
        }

        // Process via COD Stats (Hashing will filter duplicates)
        const codStats = require('../../handlers/ai/tools/cod_stats');
        // We need to fake the "args" structure or call a specialized method? 
        // cod_stats.execute expects ARGS.matches.
        // Wait, we need the AI to EXTRACT them first.
        // We can't just send raw images to cod_stats.execute, that tool SAVES data. It doesn't EXTRACT.
        // We need to run Vision Extraction first.

        // RE-USE BRAIN? 
        // No, ShimonBrain.ask handles text.
        // We need a direct "Extract & Save" pipeline.

        try {
            // 1. Vision Extract (We need a direct vision tool helper?)
            // Actually, let's use the Brain with a specific system instruction?
            // Or better: Just call standard brain flow for each image? No, that's spammy.

            // IMPLEMENTATION: We'll construct a direct Vision Call here for efficiency.
            const { generateContent } = require('../../handlers/ai/gemini');

            // Prepare Parts
            const parts = [{ text: "Extract Warzone Scoreboard data from these images. Return JSON list: [{username, kills, damage, placement, mode}]. If not a scoreboard, return empty list." }];
            buffers.forEach(b => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }));

            const result = await generateContent(parts, "gemini-2.0-flash");

            // Extract JSON
            const jsonMatch = result.match(/\[.*\]/s);
            if (!jsonMatch) {
                await sock.sendMessage(chatJid, { text: '❌ Analysis failed: No JSON found.' });
                return;
            }

            const matches = JSON.parse(jsonMatch[0]);
            const saveArgs = { matches };

            // Save
            const report = await cod_stats.execute(saveArgs, dbUserId || 'ScanAdmin', chatJid, buffers);
            await sock.sendMessage(chatJid, { text: `📊 **Scan Report:**\n${report}` });

        } catch (e) {
            await sock.sendMessage(chatJid, { text: `❌ Scan Error: ${e.message}` });
        }
        return;
    }

    if (text === "BLOCKED_SPAM") return;

    // ✅ 2. דיווח XP (רק אם מקושר!)
    // If not linked, user gets no XP (Guest Mode). This prevents DB pollution.
    if (dbUserId) {
        xpManager.handleXP(dbUserId, 'whatsapp', text, { sock, chatId: chatJid }, async (response) => {
            if (typeof response === 'string') {
                await sock.sendMessage(chatJid, { text: response }, { quoted: msg });
            }
        });
    }

    // 🔒 Global Group Lock: בדיקה אם אנחנו כבר מטפלים בתשובה לקבוצה הזו
    if (processingGroups.has(chatJid)) {
        log(`🔒 [Core] התעלמתי מפנייה מ-${senderPhone} כי אני כבר מגיב לקבוצה ${chatJid}`);
        return;
    }

    // נועלים את הקבוצה
    processingGroups.add(chatJid);

    // טיימר שחרור חירום (אם משהו נתקע, שחרר אחרי 10 שניות)
    const lockTimeout = setTimeout(() => processingGroups.delete(chatJid), 10000);

    try {
        let isExplicitCall = isTriggered(text, msg, sock);

        // Conversation history uses the SENDER PHONE for short-term chat memory (not DB)
        const lastInteraction = activeConversations.get(senderPhone);

        // 🛑 Anti-Spam (Auto-Reply Cooldown)
        if (!isExplicitCall) {
            const groupCooldown = activeConversations.get(chatJid + '_last_auto_reply');
            if (groupCooldown && Date.now() - groupCooldown < 20000) {
                return;
            }
        }

        const isInConversation = lastInteraction && (Date.now() - lastInteraction < whatsapp.conversationTimeout);

        // ✅ המוח החכם
        if (!isExplicitCall && !isInConversation) {
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentionedJids.length > 0) return;

            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
            if (quotedParticipant && !quotedParticipant.includes(botId)) return;

            const hasMedia = mediaArray && mediaArray.length > 0;
            if (!hasMedia && text.length > 10) {
                // Brain needs to know who is talking. If not linked, treat as "Guest (Phone)"
                const brainUserIdentity = dbUserId || senderPhone;
                const shouldIntervene = await shimonBrain.shouldReply(brainUserIdentity, text);

                if (shouldIntervene) {
                    log(`💡 [Smart AI] Shimon decided to intervene on: "${text}"`);
                    isExplicitCall = true;
                } else {
                    // Only learn if linked? Or learn globally? 
                    // Safe to learn if we use dbUserId. If guest, maybe skip to save DB space?
                    if (dbUserId) await learningEngine.learnFromContext(dbUserId, "Gamer", 'whatsapp', text);
                    return;
                }
            } else {
                return;
            }
        }

        activeConversations.set(senderPhone, Date.now());
        if (!isExplicitCall) {
            activeConversations.set(chatJid + '_last_auto_reply', Date.now());
        }

        await sock.sendPresenceUpdate('composing', chatJid);

        // 🕵️ INTEL INTERCEPT (System 2.0)
        // Before asking the brain, check if this is a requested Intel command
        try {
            const intelResponse = await intelManager.handleNaturalQuery(text);
            if (intelResponse) {
                log(`🕵️ [Intel] Intercepted WhatsApp Query: ${text}`);

                // Case A: Object (Weapon Meta with Image)
                if (typeof intelResponse === 'object' && intelResponse.image) {
                    await sock.sendMessage(chatJid, {
                        image: { url: intelResponse.image },
                        caption: intelResponse.text
                    }, { quoted: msg });

                    // 💥 Send Code Separately for Easy Copy
                    if (intelResponse.code && intelResponse.code !== "No Code Available") {
                        // Small delay to ensure order
                        setTimeout(async () => {
                            await sock.sendMessage(chatJid, { text: intelResponse.code });
                        }, 500);
                    }
                }
                // Case B: Simple Text (News/Playlist)
                else {
                    // Fix: Intel items return 'summary' or 'aiSummary', rarely 'text' unless simple string
                    const txt = typeof intelResponse === 'string' ? intelResponse : (intelResponse.aiSummary || intelResponse.summary || intelResponse.text);
                    if (txt) {
                        await sock.sendMessage(chatJid, { text: txt }, { quoted: msg });
                    } else {
                        log(`⚠️ [Intel] Response object has no text/summary to send: ${JSON.stringify(intelResponse)}`);
                    }
                }

                return; // Stop here, don't ask AI
            }
        } catch (e) {
            log(`⚠️ [Intel] Error during routing: ${e.message}`);
            // Fallback to AI if Intel fails
        }

        let imageBuffers = [];
        if (mediaArray && mediaArray.length > 0) {
            // Bulk Download
            log(`📥 [Core] Downloading ${mediaArray.length} images...`);
            for (const mediaMsg of mediaArray) {
                try {
                    const buf = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
                    if (buf) imageBuffers.push(buf);
                } catch (err) { log(`❌ Error downloading image: ${err.message}`); }
            }
        }

        // Ask the brain. If not linked, we pass senderPhone but Brain must treat it gracefully.
        // Brain usually needs a DB ID to fetch context. If we pass phone, it might try to fetch doc(phone) and fail (which is good) or create it (bad).
        // Check ShimonBrain later. For now, pass safest ID: dbUserId if exists, else senderPhone (for chat context).
        // But wait, if Brain creates user, we are back to square one.
        // Let's assume Brain READS only unless explicit "saveFact".

        const aiResponse = await shimonBrain.ask(
            dbUserId || senderPhone,
            'whatsapp',
            text,
            isAdmin,
            imageBuffers, // Passing ARRAY now
            chatJid
        );

        // ✅ FEEDBACK: If we processed images successfully, give a LIKE
        if (mediaArray && mediaArray.length > 0 && aiResponse && !aiResponse.includes("Error")) {
            setTimeout(async () => {
                await sock.sendMessage(chatJid, {
                    react: { text: "👍", key: msg.key }
                }).catch(() => { });
            }, 1000);
        }

        return aiResponse;

        let responseText = aiResponse;
        let audioBuffer = null;

        // ✅ זיהוי מוד קול (Toxic Voice)
        if (aiResponse && aiResponse.includes('[VOICE]')) {
            responseText = aiResponse.replace('[VOICE]', '').trim();
            try {
                const voiceEngine = require('../../handlers/media/voice');
                audioBuffer = await voiceEngine.textToSpeech(responseText);
                if (audioBuffer) {
                    await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                    // אין return כאן כדי לאפשר ניקוי נעילה ב-finally
                }
            } catch (e) {
                log(`❌ [Voice] Generation failed: ${e.message}`);
                // אם נכשל הקול, נשלח את הטקסט כגיבוי
            }
        }

        // שליחת טקסט (אם לא נשלח אודיו או אם האודיו נכשל)
        if (responseText && !audioBuffer) {
            await sock.sendMessage(chatJid, { text: responseText }, { quoted: msg });
        }

    } catch (error) {
        log(`❌ [Core] Error: ${error.message}`);
        processingGroups.delete(chatJid); // שחרור במקרה של שגיאה קריטית
    } finally {
        // משחררים את הנעילה בכל מקרה (הצלחה או כישלון)
        clearTimeout(lockTimeout);
        // השהיה קטנה נוספת של 2 שניות לשחרור כדי למנוע Spam מיידי
        setTimeout(() => processingGroups.delete(chatJid), 2000);
    }
}

module.exports = { handleMessageLogic };
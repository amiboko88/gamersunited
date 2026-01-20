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
    const isAdmin = senderPhone === '972526800647';

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

    bufferSystem.addToBuffer(senderPhone, msg, text, (finalMsg, combinedText, mediaMsg) => {
        // We pass BOTH indices: One for chat (phone), one for DB (linkedId)
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderPhone, linkedDbId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderPhone, dbUserId, chatJid, isAdmin) {
    // 🛡️ ONLY update DB if we have a valid Linked DB ID
    if (dbUserId) {
        try { await userManager.updateLastActive(dbUserId); } catch (e) { }
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

            if (!mediaMsg && text.length > 10) {
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
                    const txt = typeof intelResponse === 'string' ? intelResponse : intelResponse.text;
                    await sock.sendMessage(chatJid, { text: txt }, { quoted: msg });
                }

                return; // Stop here, don't ask AI
            }
        } catch (e) {
            log(`⚠️ [Intel] Error during routing: ${e.message}`);
            // Fallback to AI if Intel fails
        }

        let imageBuffer = null;
        if (mediaMsg) {
            imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
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
            imageBuffer,
            chatJid
        );

        let responseText = aiResponse;
        let audioBuffer = null;

        // ✅ זיהוי מוד קול (Toxic Voice)
        if (aiResponse && aiResponse.includes('[VOICE]')) {
            responseText = aiResponse.replace('[VOICE]', '').trim();
            try {
                const voiceEngine = require('../../handlers/media/voice');
                audioBuffer = await voiceEngine.textToSpeech(responseText);
                if (audioBuffer) {
                    await sock.sendMessage(chatJid, { audio: audioBuffer, ptt: true }, { quoted: msg });
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
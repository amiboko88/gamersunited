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

    let realUserId = senderPhone;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        realUserId = userRef.id;

        // 🔍 DEBUG: בדיקת LID בזמן אמת עבור אמי (מעוצב)
        const isLid = senderPhone.length > 14;
        if (isLid) {
            const status = (realUserId.length <= 14) ? "✅ VERIFIED" : "⚠️ UNKNOWN";
            // דיווח לאדמין בלבד (972526800647)
            if (status.includes("VERIFIED")) {
                const debugMsg = `📊 *LID Debug Report*\n` +
                    `🆔 **מקור:** \`${senderPhone}\` (LID)\n` +
                    `👤 **זוהה כ:** \`${realUserId}\`\n` +
                    `✅ **סטטוס:** סנכרון תקין.`;

                await sock.sendMessage('972526800647@s.whatsapp.net', { text: debugMsg });
            }
        }
    } catch (e) { }

    bufferSystem.addToBuffer(realUserId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, realUserId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid, isAdmin) {
    try { await userManager.updateLastActive(senderId); } catch (e) { }

    if (text === "BLOCKED_SPAM") return;

    // ✅ 2. דיווח XP
    xpManager.handleXP(senderId, 'whatsapp', text, { sock, chatId: chatJid }, async (response) => {
        // פונקציית תגובה (במקרה של עליית רמה, הטקסט יישלח פה אם אין תמונה)
        // אבל ה-XP Manager החדש שלך כבר יודע לשלוח תמונה לבד דרך ה-socket שהעברנו ב-contextObj
        if (typeof response === 'string') {
            await sock.sendMessage(chatJid, { text: response }, { quoted: msg });
        }
    });

    // 🔒 Global Group Lock: בדיקה אם אנחנו כבר מטפלים בתשובה לקבוצה הזו
    // אם מישהו אחר קרא לי באותה שנייה, נתעלם כדי לא לחפור ("חופר")
    if (processingGroups.has(chatJid)) {
        log(`🔒 [Core] התעלמתי מפנייה מ-${senderId} כי אני כבר מגיב לקבוצה ${chatJid}`);
        return;
    }

    // נועלים את הקבוצה
    processingGroups.add(chatJid);

    // טיימר שחרור חירום (אם משהו נתקע, שחרר אחרי 10 שניות)
    const lockTimeout = setTimeout(() => processingGroups.delete(chatJid), 10000);

    try {
        let isExplicitCall = isTriggered(text, msg, sock);
        const lastInteraction = activeConversations.get(senderId);

        // 🛑 Anti-Spam (Auto-Reply Cooldown)
        // אם לא קראו לי במפורש, אני לא מגיב אם הגבתי למישהו ב-20 שניות האחרונות באותה קבוצה
        // זה מונע השתלטות על שיחה
        if (!isExplicitCall) {
            const groupCooldown = activeConversations.get(chatJid + '_last_auto_reply');
            if (groupCooldown && Date.now() - groupCooldown < 20000) {
                return; // הבוט הגיב לאחרונה בקבוצה הזו באופן עצמאי, תן להם לנשום
            }
        }

        const isInConversation = lastInteraction && (Date.now() - lastInteraction < whatsapp.conversationTimeout);

        // ✅ המוח החכם: אם לא קראו לנו, נבדוק אם כדאי להתערב
        if (!isExplicitCall && !isInConversation) {

            // ⛔ אם ההודעה מתייגת מישהו אחר - אל תחשוב אפילו להתערב
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentionedJids.length > 0) return;

            // ⛔ אם ההודעה היא תגובה (Reply) להודעה של אדם אחר (לא הבוט) - תתעלם
            const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
            if (quotedParticipant && !quotedParticipant.includes(botId)) return;

            // סינון ראשוני: הודעות קצרות מדי או סטיקרים לא נשלחים לשיפוט (חוסך API)
            if (!mediaMsg && text.length > 10) {
                const shouldIntervene = await shimonBrain.shouldReply(senderId, text);
                if (shouldIntervene) {
                    log(`💡 [Smart AI] Shimon decided to intervene on: "${text}"`);
                    isExplicitCall = true; // הופכים לקריאה יזומה
                } else {
                    // אם החליט לא להתערב - לומד בשקט
                    await learningEngine.learnFromContext(senderId, "Gamer", 'whatsapp', text);
                    return;
                }
            } else {
                return;
            }
        }

        activeConversations.set(senderId, Date.now());
        // אם זו קריאה אוטומטית, נעדכן גם את ה-Cooldown הקבוצתי
        if (!isExplicitCall) {
            activeConversations.set(chatJid + '_last_auto_reply', Date.now());
        }

        await sock.sendPresenceUpdate('composing', chatJid);

        let imageBuffer = null;
        if (mediaMsg) {
            imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
        }

        const aiResponse = await shimonBrain.ask(
            senderId,
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
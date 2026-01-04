const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent');
const bufferSystem = require('./buffer');
const casinoLogic = require('./casino');
const gamersEngine = require('./gamers');

// חיבור למוח המאוחד החדש
const socialEngine = require('../../handlers/social'); 

/**
 * שער הכניסה - הכל עובר דרך הבאפר
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

/**
 * 🧠 המוח האמיתי - רץ רק אחרי שהבאפר משחרר את ההודעה
 */
async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    try {
        // זיהוי עצמי מדויק (כדי לדעת אם תייגו אותנו)
        const botId = sock.user.id.split(':')[0]; 
        
        // בדיקות ספציפיות: האם מדברים איתי?
        const isExplicitMention = text.includes(`@${botId}`) || text.includes('שמעון') || text.toLowerCase().includes('shimon');
        const isReplyToBot = msg.message.extendedTextMessage?.contextInfo?.participant?.includes(botId);

        // 1. תמונות (רק אם תייגו אותנו או שזה ברור שרוצים בדיקה)
        if (mediaMsg) {
            // אם לא תייגו את הבוט בתמונה, מתעלמים (כדי לא להגיב על סתם תמונות של חתולים)
            if (isExplicitMention || isReplyToBot || text.includes('דמג') || text.includes('לוח')) {
                await gamersEngine.processImage(sock, msg, chatJid, senderId, senderName);
            }
            return;
        }

        // 2. ניתוח כוונות
        const intentData = await intentAnalyzer.analyze(text, senderName);
        
        // 🛑 הפילטר החדש והחכם 🛑
        // אם הציון נמוך מ-90, ואף אחד לא קרא לי בשם/תיוג/תגובה -> תתעלם!
        // זה ימנע תגובה על "@יוגי מה קורה" (כי הציון הוא SOCIAL=20 ואין תיוג של שמעון)
        if (intentData.interestScore < 90 && !isExplicitMention && !isReplyToBot) {
            // log(`[Core] 💤 מתעלם. (Score: ${intentData.interestScore}, Not mentioned)`);
            return;
        }

        log(`[Core] 🧠 Intent: ${intentData.category} | Score: ${intentData.interestScore}`);

        // 3. ניתוב לפי קטגוריה

        // הימורים
        if (intentData.category === 'GAMBLING' || intentData.category === 'CASINO_ROULETTE') {
             if (text.includes('רולטה')) {
                 const { handleShimonRoulette } = require('../handlers/rouletteHandler');
                 await handleShimonRoulette(sock, chatJid);
             } else {
                 await casinoLogic.handleBetRequest(sock, chatJid, senderId, senderName, text);
             }
             return;
        }

        // בקשת פרופיל
        if (intentData.category === 'PROFILE') {
            await socialEngine.handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName);
            return;
        }

        // Social / Trash Talk
        await sock.sendPresenceUpdate('composing', chatJid);

        const reply = await socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer", 
            intentData.sentiment, 
            intentData.category, 
            'whatsapp'
        );

        await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });

    } catch (error) {
        console.error('❌ [Core] Critical Error:', error);
    }
}

module.exports = { handleMessageLogic };
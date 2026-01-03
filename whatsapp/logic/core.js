// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent'); // הקובץ המקורי שלך
const bufferSystem = require('./buffer');   // הקובץ המקורי שלך
const casinoLogic = require('./casino');    // הקובץ המקורי שלך (צריך לוודא שהוא מעודכן, ראה למטה)
const gamersEngine = require('./gamers');   // הקובץ המקורי שלך

// חיבור למוח המאוחד
const socialEngine = require('../../handlers/social'); 

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    try {
        // 1. תמונות
        if (mediaMsg) {
            await gamersEngine.processImage(sock, msg, chatJid, senderId, senderName);
            return;
        }

        // 2. ניתוח כוונות
        const intentData = await intentAnalyzer.analyze(text, senderName);
        log(`[Core] 🧠 Intent: ${intentData.category} (${intentData.interestScore})`);

        const isMention = text.includes('@') || text.includes('שמעון');
        if (intentData.interestScore < 60 && !isMention) return; // סינון רעש

        // 3. ניתוב
        if (intentData.category === 'GAMBLING' || intentData.category === 'CASINO_ROULETTE') {
             if (text.includes('רולטה')) {
                 const { handleShimonRoulette } = require('../handlers/rouletteHandler');
                 await handleShimonRoulette(sock, chatJid);
             } else {
                 await casinoLogic.handleBetRequest(sock, chatJid, senderId, senderName, text);
             }
             return;
        }

        if (intentData.category === 'PROFILE') {
            await socialEngine.handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName);
            return;
        }

        // שליחה למוח הראשי (Social)
        await sock.sendPresenceUpdate('composing', chatJid);
        const reply = await socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer",
            intentData.sentiment,
            intentData.category, // העברת הקטגוריה כדי שהמוח ידע איזה סטייל לבחור!
            'whatsapp'
        );

        await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });

    } catch (error) {
        console.error('Core Error:', error);
    }
}

module.exports = { handleMessageLogic };
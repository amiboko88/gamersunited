const { log } = require('../../utils/logger');
const { isSystemActive } = require('../utils/timeHandler');
const { incrementTotalMessages } = require('../handlers/profileHandler');

// מודולים לוגיים
const intentAnalyzer = require('./intent');
const socialEngine = require('./social');
const gamersEngine = require('./gamers');
const memoryEngine = require('./memory');
const casinoLogic = require('./casino');
const bufferSystem = require('./buffer'); // המערכת למניעת ספאם

/**
 * שער הכניסה החדש - הכל עובר דרך הבאפר
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // שליחה לחדר ההמתנה (Buffer)
    // רק כשהמשתמש מסיים להקליד, הפונקציה executeCoreLogic תופעל
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

/**
 * 🧠 המוח האמיתי - רץ רק אחרי שהבאפר משחרר את ההודעה
 */
async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "פלוני";
    
    // 1. למידה פסיבית (על הטקסט המלא!)
    memoryEngine.learn(senderId, text); 

    // 2. עדכון סטטיסטיקות
    const levelData = await incrementTotalMessages(senderId, senderName);
    if (levelData && levelData.leveledUp) {
        await socialEngine.celebrateLevelUp(sock, chatJid, senderId, senderName, levelData);
    }

    // 3. ניתוח כוונות + סנטימנט
    const intentData = await intentAnalyzer.analyze(text, senderName);
    log(`[Core] 🧠 Processed Batch | Intent: ${intentData.category} | Sentiment: ${intentData.sentiment} | Score: ${intentData.interestScore}`);

    // 4. בדיקת שעות פעילות
    const sysStatus = isSystemActive();
    if (!sysStatus.active) {
        if (text.includes('@') || intentData.interestScore > 85) {
            await socialEngine.handleOfflineInteraction(sock, chatJid, senderName, senderId, sysStatus.reason, text);
        } else if (intentData.interestScore > 50) {
            await sock.sendMessage(chatJid, { react: { text: "😴", key: msg.key } });
        }
        return;
    }

    // 5. ניתוב למנועים המומחים

    // אם יש תמונה ברצף ההודעות - גיימרים מטפל בה
    if (mediaMsg) {
        if (!mediaMsg.message.imageMessage.caption) {
            mediaMsg.message.imageMessage.caption = text; // מצמידים את הטקסט לתמונה
        }
        await gamersEngine.processImage(sock, mediaMsg, chatJid, senderId, senderName);
        return;
    }

    // קזינו
    if (intentData.category === 'GAMBLING' || intentData.category === 'CASINO_ROULETTE') {
        if (text.includes('רולטה')) {
            await socialEngine.sendQuickReply(sock, chatJid, senderId, senderName, "תחזיק חזק...", "מאיים");
            const { handleShimonRoulette } = require('../handlers/rouletteHandler'); 
            await handleShimonRoulette(sock, chatJid);
        } else {
            await casinoLogic.handleBetRequest(sock, chatJid, senderId, senderName, text);
        }
        return;
    }

    // חברתי ופרופיל
    switch (intentData.category) {
        case 'PROFILE': // הטיפול החדש בפרופיל
            await socialEngine.handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName);
            break;
        case 'GAMING_INVITE':
            await socialEngine.handleGameInvite(sock, chatJid, senderId, senderName, text, intentData.sentiment);
            break;
        case 'HELP_REQUEST':
            await socialEngine.handleHelpRequest(sock, chatJid, msg, senderId, senderName, text, intentData.sentiment);
            break;
        case 'TRASH_TALK':
        case 'INSULT_BOT':
            await socialEngine.handleToxicResponse(sock, chatJid, msg, senderId, senderName, text);
            break;
        case 'PRAISE':
        case 'SOCIAL':
            await socialEngine.handleGeneralChat(sock, chatJid, msg, senderId, senderName, text, intentData.category, intentData.sentiment);
            break;
    }
}

module.exports = { handleMessageLogic };
const { log } = require('../../utils/logger');
const { isSystemActive } = require('../utils/timeHandler');
const { incrementTotalMessages } = require('../handlers/profileHandler');

// ייבוא המודולים החדשים
const intentAnalyzer = require('./intent');
const socialEngine = require('./social');
const gamersEngine = require('./gamers');
const memoryEngine = require('./memory');
const casinoLogic = require('./casino');

// 🔥 התיקון: הפרדת הייבוא לקבצים הנכונים
const { generateProfileCard } = require('../handlers/profileRenderer'); // הצייר
const { getUserFullProfile } = require('../handlers/profileHandler');   // מנהל הנתונים
const fs = require('fs');

// מילות מפתח לפרופיל
const PROFILE_KEYWORDS = ['פרופיל', 'כרטיס', 'סטטוס', 'דרגה', 'כמה כסף', 'ארנק', 'xp', 'מצב חשבון'];

/**
 * המוח הראשי - Core Logic V3.3 (Fixed Import)
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];
    const senderName = msg.pushName || "פלוני";
    const lowerText = text.trim().toLowerCase();
    
    // 1. למידה פסיבית
    memoryEngine.learn(senderId, text); 

    // 2. עדכון סטטיסטיקות
    const levelData = await incrementTotalMessages(senderId, senderName);
    if (levelData && levelData.leveledUp) {
        await socialEngine.celebrateLevelUp(sock, chatJid, senderId, senderName, levelData);
    }

    // 3. פרופיל מהיר
    if (PROFILE_KEYWORDS.some(k => lowerText.includes(k)) && lowerText.split(' ').length <= 4) {
        await handleProfileRequest(sock, chatJid, senderId, senderName, msg);
        return;
    }

    // 4. ניתוח כוונות
    const intentData = await intentAnalyzer.analyze(text, senderName);
    log(`[Core] 🧠 Intent: ${intentData.category} | Score: ${intentData.interestScore}`);

    // 5. בדיקת שעות פעילות
    const sysStatus = isSystemActive();
    
    if (!sysStatus.active) {
        if (text.includes('@') || intentData.interestScore > 85) {
            await socialEngine.handleOfflineInteraction(sock, chatJid, senderName, senderId, sysStatus.reason, text);
        } else if (intentData.interestScore > 50) {
            await sock.sendMessage(chatJid, { react: { text: "😴", key: msg.key } });
        }
        return;
    }

    // 6. ניתוב למנועים

    if (msg.message.imageMessage) {
        await gamersEngine.processImage(sock, msg, chatJid, senderId, senderName);
        return;
    }

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

    switch (intentData.category) {
        case 'GAMING_INVITE':
            // 🔥 מעבירים גם את הטקסט כדי להבין הקשר (אם זה 1 על 1 או לכולם)
            await socialEngine.handleGameInvite(sock, chatJid, senderId, senderName, text);
            break;
        case 'HELP_REQUEST':
            await socialEngine.handleHelpRequest(sock, chatJid, msg, senderId, senderName, text);
            break;
        case 'TRASH_TALK':
        case 'INSULT_BOT':
            await socialEngine.handleToxicResponse(sock, chatJid, msg, senderId, senderName, text);
            break;
        case 'PRAISE':
        case 'SOCIAL':
            await socialEngine.handleGeneralChat(sock, chatJid, msg, senderId, senderName, text, intentData.category);
            break;
    }
}

async function handleProfileRequest(sock, chatJid, senderId, senderName, msg) {
    await sock.sendPresenceUpdate('composing', chatJid);
    let avatarUrl;
    try { avatarUrl = await sock.profilePictureUrl(msg.key.remoteJid, 'image'); } catch { avatarUrl = null; }

    // עכשיו הפונקציה מיובאת נכון ולא תקרוס
    const waUserRef = await getUserFullProfile(senderId, senderName);
    const totalMessages = waUserRef.whatsappData?.totalMessages || 0; 
    const balance = waUserRef.discordData?.xp || waUserRef.whatsappData?.xp || 0;

    const cardPath = await generateProfileCard({
        name: senderName,
        avatarUrl: avatarUrl,
        messageCount: totalMessages,
        balance: balance
    });

    await sock.sendMessage(chatJid, { 
        image: fs.readFileSync(cardPath),
        caption: `💳 הכרטיס של **${senderName}**`
    }, { quoted: msg });

    try { fs.unlinkSync(cardPath); } catch (e) {}
}

module.exports = { handleMessageLogic };
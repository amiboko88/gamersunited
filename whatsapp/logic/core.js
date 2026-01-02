const { log } = require('../../utils/logger');
const { isSystemActive } = require('../utils/timeHandler');
const { incrementTotalMessages } = require('../handlers/profileHandler');

// ייבוא המודולים החדשים
const intentAnalyzer = require('./intent');
const socialEngine = require('./social');
const gamersEngine = require('./gamers');
const memoryEngine = require('./memory');
const casinoLogic = require('./casino');

// הנדלרים ספציפיים שעדיין בשימוש ישיר ע"י ה-Core (אם יש כאלה)
const { generateProfileCard, getUserFullProfile } = require('../handlers/profileRenderer');
const fs = require('fs');

// מילות מפתח לפרופיל (עדיין קיים כקיצור דרך, אך ניתן להסרה אם תרצה הכל AI)
const PROFILE_KEYWORDS = ['פרופיל', 'כרטיס', 'סטטוס', 'דרגה', 'כמה כסף', 'ארנק', 'xp', 'מצב חשבון'];

/**
 * המוח הראשי - Core Logic V3 (Clean & Pure AI)
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];
    const senderName = msg.pushName || "פלוני"; // זה השם שיישמר עכשיו ב-DB
    const lowerText = text.trim().toLowerCase();
    
    // 1. למידה פסיבית
    memoryEngine.learn(senderId, text); 

    // 2. עדכון סטטיסטיקות + תיקון שם משתמש ב-DB + בדיקת רמה
    // 🔥 כאן העברנו את senderName
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
    // 5. בדיקת שעות פעילות (הטיפול עבר ל-AI ב-Social Engine)
    const sysStatus = isSystemActive();
    
    // אם המערכת "כבויה" (שבת/לילה)
    if (!sysStatus.active) {
        // רק אם הציון גבוה מאוד (ממש חופרים) או שיש תיוג - ה-AI יגיב בעצבים
        if (text.includes('@') || intentData.interestScore > 85) {
            await socialEngine.handleOfflineInteraction(sock, chatJid, senderName, senderId, sysStatus.reason, text);
        } else if (intentData.interestScore > 50) {
            // סתם ריאקשן שקט כדי להראות סימן חיים
            await sock.sendMessage(chatJid, { react: { text: "😴", key: msg.key } });
        }
        return;
    }

    // 6. ניתוב למנועים המומחים

    // 📸 מנוע גיימינג (תמונות)
    if (msg.message.imageMessage) {
        await gamersEngine.processImage(sock, msg, chatJid, senderId, senderName);
        return;
    }

    // 🎰 קזינו והימורים
    if (intentData.category === 'GAMBLING' || intentData.category === 'CASINO_ROULETTE') {
        if (text.includes('רולטה')) {
            await socialEngine.sendQuickReply(sock, chatJid, senderId, senderName, "תחזיק חזק...", "מאיים");
            const { handleShimonRoulette } = require('../handlers/rouletteHandler'); // טעינה רק כשצריך
            await handleShimonRoulette(sock, chatJid);
        } else {
            await casinoLogic.handleBetRequest(sock, chatJid, senderId, senderName, text);
        }
        return;
    }

    // 🤝 מנוע חברתי (כל השאר)
    switch (intentData.category) {
        case 'GAMING_INVITE':
            await socialEngine.handleGameInvite(sock, chatJid, senderId, senderName);
            break;
        case 'HELP_REQUEST':
            await socialEngine.handleHelpRequest(sock, chatJid, senderId, senderName, text);
            break;
        case 'TRASH_TALK':
        case 'INSULT_BOT':
            await socialEngine.handleToxicResponse(sock, chatJid, msg, senderId, senderName, text);
            break;
        case 'PRAISE':
        case 'SOCIAL':
            await socialEngine.handleGeneralChat(sock, chatJid, senderId, senderName, text, intentData.category);
            break;
    }
}

async function handleProfileRequest(sock, chatJid, senderId, senderName, msg) {
    await sock.sendPresenceUpdate('composing', chatJid);
    let avatarUrl;
    try { avatarUrl = await sock.profilePictureUrl(msg.key.remoteJid, 'image'); } catch { avatarUrl = null; }

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
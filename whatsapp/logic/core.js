// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer'); 
const { isSystemActive } = require('../utils/timeHandler'); 
const { getUserRef } = require('../../utils/userUtils'); 
const visionSystem = require('../../handlers/media/vision'); 

// מערכות AI
const shimonBrain = require('../../handlers/ai/brain'); 
const learningEngine = require('../../handlers/ai/learning'); 
const userManager = require('../../handlers/users/manager'); 

const shabbatSpamCounter = new Map(); 
const activeConversations = new Map(); 
const CONVERSATION_TIMEOUT = 120 * 1000; 

function isTriggered(text, msg, sock) {
    const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
    
    // 1. קריאה מפורשת
    if (text.includes('שמעון') || text.includes('שימי') || text.includes('בוט')) return true;
    
    // 2. תיוג ישיר
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (botId && mentionedJids.some(jid => jid.includes(botId))) return true;

    // 3. תגובה להודעה של הבוט
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (botId && quotedParticipant && quotedParticipant.includes(botId)) return true;

    // 4. מילות מפתח קריטיות (כדי להעיר את ה-AI למשחקים)
    const wakeWords = ['רולטה', 'הימור', 'בט', 'סקור', 'דמג', 'תנגן', 'שיר'];
    if (wakeWords.some(word => text.includes(word))) return true;

    return false;
}

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];

    // --- שעות פעילות ---
    const systemStatus = isSystemActive();
    
    // ✅ תיקון מספר האדמין
    const isAdmin = senderPhone === '972526800647'; 
    
    if (!systemStatus.active && systemStatus.reason === "Shabbat") {
        if (isAdmin) { 
            // אדמין עוקף שבת
        } else {
            // לוגיקת שבת מבוססת AI
            // אנחנו עדיין שומרים על מנגנון נגד הצפה (מגיב רק כל הודעה שלישית) כדי לא לחלל שבת בעצמו יותר מדי
            if (text.includes('שמעון')) {
                const count = (shabbatSpamCounter.get(senderPhone) || 0) + 1;
                shabbatSpamCounter.set(senderPhone, count);
                
                if (count === 3) {
                    // ✅ קריאה ל-AI במקום רשימה קבועה!
                    const shabbatRoast = await shimonBrain.ask(
                        senderPhone, 
                        'whatsapp', 
                        "המערכת מזהה שעכשיו שבת ואני מדבר איתך. תנזוף בי שאני מפריע לך במנוחה/תפילה. תהיה דתי-ערס.", 
                        false
                    );
                    await sock.sendMessage(chatJid, { text: shabbatRoast }, { quoted: msg });
                    shabbatSpamCounter.set(senderPhone, 0); 
                }
            }
            return; // לא ממשיכים ללוגיקה הרגילה בשבת
        }
    } else if (!systemStatus.active && !isAdmin) return;

    let realUserId = senderPhone;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        realUserId = userRef.id; 
    } catch (e) {}

    bufferSystem.addToBuffer(realUserId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, realUserId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid, isAdmin) {
    try { await userManager.updateLastActive(senderId); } catch (e) {}

    if (text === "BLOCKED_SPAM") return; 

    try {
        // --- בדיקת הפעלה ---
        const isExplicitCall = isTriggered(text, msg, sock);
        const lastInteraction = activeConversations.get(senderId);
        const isInConversation = lastInteraction && (Date.now() - lastInteraction < CONVERSATION_TIMEOUT);

        // אם לא קראו לנו ואין הקשר -> צופה שקט בלבד
        if (!isExplicitCall && !isInConversation) {
            await learningEngine.learnFromContext(senderId, "Gamer", 'whatsapp', text);
            return; 
        }

        // --- ה-AI נכנס לפעולה! ---
        activeConversations.set(senderId, Date.now());
        await sock.sendPresenceUpdate('composing', chatJid);

        // הורדת תמונה (אם יש) ל-Vision
        let imageBuffer = null;
        if (mediaMsg) {
            imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
        }

        // 🧠 המוח
        const aiResponse = await shimonBrain.ask(senderId, 'whatsapp', text, isAdmin, imageBuffer);
        
        if (aiResponse) {
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
        }

    } catch (error) {
        log(`❌ [Core] Error: ${error.message}`);
    }
}

module.exports = { handleMessageLogic };
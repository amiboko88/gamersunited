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
    
    // 1. קריאה מפורשת בשם
    if (text.includes('שמעון') || text.includes('שימי') || text.includes('בוט')) return true;
    
    // 2. תיוג ישיר
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (botId && mentionedJids.some(jid => jid.includes(botId))) return true;

    // 3. תגובה להודעה של הבוט
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (botId && quotedParticipant && quotedParticipant.includes(botId)) return true;

    // 4. מילות מפתח שמעירות את ה-AI (במקום לבדוק ידנית בקוד, ה-AI יטפל בהן)
    const wakeWords = [
        'רולטה', 'הימור', 'בט', // קזינו
        'סקור', 'דמג', 'לוח',   // Vision
        'תנגן', 'שיר', 'פלייליסט', // DJ
        'יום הולדת', 'יומולדת', 'תאריך לידה' // ימי הולדת
    ];
    
    // בדיקה אם אחת המילות מופיעה (אבל לא סתם כחלק ממילה, אלא כמילה בפני עצמה או הקשר ברור)
    if (wakeWords.some(word => text.includes(word))) return true;

    return false;
}

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];

    // --- שעות פעילות ---
    const systemStatus = isSystemActive();
    const isAdmin = senderPhone === '972526800647'; 
    
    if (!systemStatus.active && systemStatus.reason === "Shabbat") {
        if (isAdmin) { 
            // Bypass
        } else {
            if (text.includes('שמעון')) {
                const count = (shabbatSpamCounter.get(senderPhone) || 0) + 1;
                shabbatSpamCounter.set(senderPhone, count);
                
                if (count === 3) {
                    const shabbatRoast = await shimonBrain.ask(senderPhone, 'whatsapp', "זה שבת ואני מדבר איתך. תנזוף בי דתי-ערס.", false);
                    await sock.sendMessage(chatJid, { text: shabbatRoast }, { quoted: msg });
                    shabbatSpamCounter.set(senderPhone, 0); 
                }
            }
            return; 
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

        let imageBuffer = null;
        if (mediaMsg) {
            imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
        }

        // 🧠 המוח מקבל הכל: טקסט, תמונה, ואת ה-ID של הצ'אט (כדי לדעת לאן לענות)
        // כאן הקסם: אין יותר IF/ELSE. הכל הולך ל-AI.
        const aiResponse = await shimonBrain.ask(
            senderId, 
            'whatsapp', 
            text, 
            isAdmin, 
            imageBuffer, 
            chatJid // ✅ קריטי: מעבירים את ה-Chat ID
        );
        
        if (aiResponse) {
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
        }

    } catch (error) {
        log(`❌ [Core] Error: ${error.message}`);
    }
}

module.exports = { handleMessageLogic };
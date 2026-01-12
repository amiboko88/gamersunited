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

const activeConversations = new Map(); 
const CONVERSATION_TIMEOUT = 120 * 1000; 

function isTriggered(text, msg, sock) {
    const chatJid = msg.key.remoteJid;
    const isPrivate = !chatJid.endsWith('@g.us'); // זיהוי צ'אט פרטי

    // בפרטי - תמיד מופעל (לא צריך לקרוא לו בשם)
    if (isPrivate) return true;

    const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
    
    // 1. קריאה מפורשת
    if (text.includes('שמעון') || text.includes('שימי') || text.includes('בוט')) return true;
    
    // 2. תיוג ישיר
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (botId && mentionedJids.some(jid => jid.includes(botId))) return true;

    // 3. תגובה להודעה של הבוט
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (botId && quotedParticipant && quotedParticipant.includes(botId)) return true;

    // 4. מילות מפתח (מעיר את ה-AI)
    const wakeWords = ['רולטה', 'הימור', 'בט', 'סקור', 'דמג', 'תנגן', 'שיר', 'מתי', 'יום הולדת', 'יומולדת'];
    if (wakeWords.some(word => text.includes(word))) return true;

    return false;
}

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];
    const isPrivate = !chatJid.endsWith('@g.us');

    // --- בדיקת שעות פעילות (AI מלא) ---
    const systemStatus = isSystemActive();
    const isAdmin = senderPhone === '972526800647'; 
    
    // אם המערכת מושבתת (שבת/שנ"צ/לילה) והמשתמש לא אדמין
    if (!systemStatus.active && !isAdmin) {
        
        // האם המשתמש מנסה ליצור אינטראקציה? (בפרטי תמיד כן, בקבוצה רק אם קראו לו)
        const isInteraction = isPrivate || text.includes('שמעון') || text.includes('שימי') || text.includes('בוט');

        if (!isInteraction) return; // סתם הודעה בקבוצה בזמן מנוחה - מתעלמים.

        // אנחנו לא מכתיבים לו את התשובה!
        // אנחנו שולחים למוח "הוראת מערכת" והוא יגיב לטקסט המקורי של המשתמש.
        
        const modeDescription = {
            "Shabbat": "SHABBAT_MODE (Religious/Rest day)",
            "Siesta": "SIESTA_MODE (Afternoon Nap/Food - Do not disturb)",
            "Night": "NIGHT_MODE (Sleeping - Do not disturb)"
        }[systemStatus.reason] || "REST_MODE";

        // הפרומפט המתוחכם:
        // "המערכת במצב X. המשתמש כתב: Y. תגיב לו בהתאם לאופי שלך ולעובדה שאסור לך לעבוד עכשיו."
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

    // --- המשך לוגיקה רגילה (כשהמערכת פעילה) ---

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
        // --- בדיקת טריגר ---
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

        const aiResponse = await shimonBrain.ask(
            senderId, 
            'whatsapp', 
            text, 
            isAdmin, 
            imageBuffer, 
            chatJid 
        );
        
        if (aiResponse) {
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
        }

    } catch (error) {
        log(`❌ [Core] Error: ${error.message}`);
    }
}

module.exports = { handleMessageLogic };
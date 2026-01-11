// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer'); 
const { isSystemActive } = require('../utils/timeHandler'); 
const { getUserRef } = require('../../utils/userUtils'); 

// ... (ייבוא מערכות - נשאר זהה) ...
const shimonBrain = require('../../handlers/ai/brain'); 
const learningEngine = require('../../handlers/ai/learning'); 
const birthdayManager = require('../../handlers/birthday/manager');
const casinoSystem = require('../../handlers/economy/casino'); 
const rouletteSystem = require('../../handlers/economy/roulette');
const visionSystem = require('../../handlers/media/vision'); 
const generatorSystem = require('../../handlers/media/generator'); 
const mediaDirector = require('../../handlers/media/director'); 
const userManager = require('../../handlers/users/manager'); 

// ... (הגדרות שבת וקריסות - נשארות זהות) ...
const shabbatSpamCounter = new Map(); 
const RELIGIOUS_RESPONSES = [ ... ]; // (כמו בקובץ המקורי)
const MAINTENANCE_RESPONSES = [ ... ]; // (כמו בקובץ המקורי)
let lastCrashReply = 0;
const CRASH_COOLDOWN = 1000 * 60 * 15; 

// ✅ מפה למעקב אחרי שיחות פעילות (מי דיבר עם שמעון לאחרונה)
const activeConversations = new Map(); 
const CONVERSATION_TIMEOUT = 120 * 1000; // 2 דקות של הקשבה רצופה

function getSmartErrorResponse() { ... } // (כמו במקור)

/**
 * בדיקה חכמה: האם ההודעה מכוונת לשמעון?
 */
function isTriggered(text, msg, sock) {
    const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
    
    // 1. קריאה מפורשת בשם
    if (text.includes('שמעון') || text.includes('שימי') || text.includes('בוט')) return true;
    
    // 2. תיוג (Mention) - בודקים אם התיוג הוא ספציפית לבוט!
    // ה-contextInfo מכיל את רשימת המתויגים
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentionedJids.some(jid => jid.includes(botId))) return true;

    // 3. תגובה (Reply) להודעה של שמעון
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedParticipant && quotedParticipant.includes(botId)) return true;

    return false;
}

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];

    // ... (לוגיקת שעות פעילות ואדמין - נשארת זהה) ...
    const systemStatus = isSystemActive();
    const isAdmin = senderPhone === '972526800647' || senderPhone === '508753233'; 
    // ... (העתק את לוגיקת השבת מהקובץ המקורי שלך לכאן) ...
    if (!systemStatus.active && systemStatus.reason === "Shabbat") {
       // ... (לוגיקת שבת) ...
       if (!isAdmin) return; 
    } else if (!systemStatus.active && !isAdmin) return;


    let realUserId = senderPhone;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        realUserId = userRef.id; 
    } catch (e) { }

    bufferSystem.addToBuffer(realUserId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, realUserId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid, isAdmin) {
    const senderName = msg.pushName || "גיימר";
    
    // עדכון פעילות
    try { await userManager.updateLastActive(senderId); } catch (e) {}

    // חסימת ספאם
    if (text === "BLOCKED_SPAM") {
        const roast = await shimonBrain.ask(senderId, 'whatsapp', "אני מספים. רד עלי.", false);
        await sock.sendMessage(chatJid, { text: `🚨 ${roast}` }, { quoted: msg });
        return;
    }

    try {
        // --- 1. בדיקת טריגרים לשיחה ---
        const isExplicitCall = isTriggered(text, msg, sock);
        
        // בדיקת רצף שיחה (Context Window)
        const lastInteraction = activeConversations.get(senderId);
        const isInConversation = lastInteraction && (Date.now() - lastInteraction < CONVERSATION_TIMEOUT);

        // אם זו לא פנייה ישירה וגם לא חלק משיחה רציפה -> הולכים לצופה השקט
        if (!isExplicitCall && !isInConversation) {
            // ... (ימי הולדת, רולטה, הימורים - נשארים כאן כי הם טריגרים עצמאיים) ...
            // (העתק לכאן את הבלוקים של birthdayManager, casinoSystem, rouletteSystem מהקובץ המקורי)
            
            // בדיקת Vision (רק אם ביקשו במפורש לראות לוח/סקור, או אם תויג)
            // (אחרת הוא סתם יגיב על כל תמונה)
            
            // --- צופה שקט ---
            await learningEngine.learnFromContext(senderId, senderName, 'whatsapp', text);
            const smartMedia = await mediaDirector.handleSmartResponse(text, senderId, 'whatsapp', senderName);
            if (smartMedia) {
                 // ... (שליחת מדיה) ...
                 if (smartMedia.type === 'audio_buffer') await sock.sendMessage(chatJid, { audio: smartMedia.data, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                 // ...
            }
            return; // 🛑 עוצרים כאן. שמעון לא מגיב טקסטואלית.
        }

        // --- הגיע לכאן? סימן שצריך לענות! ---
        
        // עדכון זמן שיחה אחרון (כדי להמשיך להקשיב ל-"סתום ת'פה")
        activeConversations.set(senderId, Date.now());

        // --- Vision (אם יש תמונה והיא חלק מהשיחה) ---
        if (mediaMsg) {
             const imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
             if (imageBuffer) {
                 const analysis = await visionSystem.analyzeImage(imageBuffer, 
                     `ניתוח תמונה. המשתמש אמר: "${text}". תהיה ציני.`
                 );
                 if (analysis) {
                     await sock.sendMessage(chatJid, { text: analysis }, { quoted: msg });
                     return;
                 }
             }
        }

        // --- המוח המרכזי ---
        await sock.sendPresenceUpdate('composing', chatJid);
        const aiResponse = await shimonBrain.ask(senderId, 'whatsapp', text, isAdmin);
        await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });

    } catch (error) {
        log(`❌ [Core] Error: ${error.message}`);
        // ... (טיפול בשגיאות)
    }
}

module.exports = { handleMessageLogic };
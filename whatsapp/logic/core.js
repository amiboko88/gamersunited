// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer'); 
const { isSystemActive } = require('../utils/timeHandler'); 
const { getUserRef } = require('../../utils/userUtils'); 

// --- ייבוא המערכות ---
const shimonBrain = require('../../handlers/ai/brain'); 
const learningEngine = require('../../handlers/ai/learning'); 
const birthdayManager = require('../../handlers/birthday/manager');
const casinoSystem = require('../../handlers/economy/casino'); 
const rouletteSystem = require('../../handlers/economy/roulette');
const visionSystem = require('../../handlers/media/vision'); 
const generatorSystem = require('../../handlers/media/generator'); 
const mediaDirector = require('../../handlers/media/director'); 
const userManager = require('../../handlers/users/manager'); 

const shabbatSpamCounter = new Map(); 

// ✅ המערכים המלאים (ללא קיצורים)
const RELIGIOUS_RESPONSES = [
    "ששש... 🤫 מנחה עכשיו. דבר איתי במוצ\"ש.",
    "הלו? שבת היום! אין לך בית כנסת ללכת אליו?",
    "אחי, גזל שינה בשבת תענוג. שחרר אותי באמאשך.",
    "בורא פרי הגפן... 🍷 בדיוק באמצע הקידוש. אל תפריע.",
    "מי זה צועק בשבת קודש? חילול ה' מה שקורה פה בקבוצה.",
    "שבת היום יא צדיק. תנוח, תאכל צ'ולנט, עזוב את הטלפון.",
    "אסור לכתוב בשבת! (כן אני בוט, לי מותר, לך אסור).",
    "שמע ישראל... תנו לישון צהריים בשקט!",
    "מלאכים עכשיו שרים לי באוזן, ואתה חופר לי בווצאפ? קישטה."
];

let lastCrashReply = 0;
const CRASH_COOLDOWN = 1000 * 60 * 15; 

const MAINTENANCE_RESPONSES = [
    "וואלה נתקע לי ה-RAM. תנו לי כמה דקות להתאפס על עצמי.",
    "המתכנת שלי נגע במשהו ועכשיו אני בשיפוצים. תכף אשוב.",
    "הלכתי להביא פיצה, השרת רעב. נדבר עוד מעט.",
    "יש לי לאג במוח. חכו רגע, אני עושה ריסטרט.",
    "נתקע לי כבל בגרון. הפסקה טכנית.",
    "אני כרגע במוד 'מוסך', מטפלים לי בפלאגים. מיד חוזר.",
    "שניה אני מפרמט את עצמי. תמשיכו לדבר, אני מקשיב בחצי אוזן."
];

// ✅ מפה למעקב אחרי שיחות פעילות (לשמירת הקשר)
const activeConversations = new Map(); 
const CONVERSATION_TIMEOUT = 120 * 1000; // 2 דקות של הקשבה רצופה

function getSmartErrorResponse() {
    const now = Date.now();
    if (now - lastCrashReply > CRASH_COOLDOWN) {
        lastCrashReply = now;
        return MAINTENANCE_RESPONSES[Math.floor(Math.random() * MAINTENANCE_RESPONSES.length)];
    }
    return null;
}

/**
 * בדיקה חכמה: האם ההודעה מכוונת לשמעון?
 */
function isTriggered(text, msg, sock) {
    const botId = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
    
    // 1. קריאה מפורשת בשם
    if (text.includes('שמעון') || text.includes('שימי') || text.includes('בוט')) return true;
    
    // 2. תיוג (Mention) - בודקים אם התיוג הוא ספציפית לבוט!
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

    // --- 🛑 בדיקה 0: שעות פעילות (שבת/לילה/צהריים) ---
    const systemStatus = isSystemActive();
    const isAdmin = senderPhone === '972526800647' || senderPhone === '508753233'; 
    
    if (!systemStatus.active && systemStatus.reason === "Shabbat") {
        if (isAdmin) {
             log(`[Shabbat Bypass] המנהל ${senderPhone} דיבר בשבת. מאשר גישה.`);
        } else {
            if (text.includes('שמעון') || text.includes('שימי')) {
                const currentCount = (shabbatSpamCounter.get(senderPhone) || 0) + 1;
                shabbatSpamCounter.set(senderPhone, currentCount);

                log(`[Shabbat] ${senderPhone} הציק פעם ${currentCount} (טריגר: ${text})`);

                if (currentCount === 3) {
                    const randomResponse = RELIGIOUS_RESPONSES[Math.floor(Math.random() * RELIGIOUS_RESPONSES.length)];
                    await sock.sendMessage(chatJid, { text: randomResponse }, { quoted: msg });
                    shabbatSpamCounter.set(senderPhone, 0); 
                }
            }
            return;
        }
    } else if (!systemStatus.active) {
         if (!isAdmin) return;
    }

    // --- ✅ זהות כפולה ---
    let realUserId = senderPhone;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        realUserId = userRef.id; 
    } catch (e) {}

    // שליחה לבאפר עם המשתנה isAdmin
    bufferSystem.addToBuffer(realUserId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, realUserId, chatJid, isAdmin);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid, isAdmin) {
    const senderName = msg.pushName || "גיימר";
    
    try { await userManager.updateLastActive(senderId); } catch (e) {}

    // חסימת ספאם
    if (text === "BLOCKED_SPAM") {
        const roast = await shimonBrain.ask(senderId, 'whatsapp', "אני מספים. רד עלי.", false);
        await sock.sendMessage(chatJid, { text: `🚨 ${roast}` }, { quoted: msg });
        return;
    }

    try {
        // --- בדיקות טריגרים עצמאיים (עובדים תמיד) ---

        // 🎂 ימי הולדת
        const dateMatch = text.match(/\b(\d{1,2})[\.\/](\d{1,2})(?:[\.\/](\d{2,4}))?\b/);
        if (dateMatch && text.length < 30) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);
            let year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
            if (year < 100) year += 2000;
            try {
                const res = await birthdayManager.registerUser(senderId, 'whatsapp', day, month, year);
                await sock.sendMessage(chatJid, { text: `✅ רשמתי! יום הולדת ב-${res.day}/${res.month}. נחגוג לך בגיל ${res.age}!` }, { quoted: msg });
                return;
            } catch (e) { }
        }

        // 🎰 רולטה
        if (text.includes('רולטה')) {
            const result = await rouletteSystem.spinRoulette();
            if (result) {
                if (result.type === 'sticker') await sock.sendMessage(chatJid, { sticker: { url: result.path } });
                else await sock.sendMessage(chatJid, { video: { url: result.url }, gifPlayback: true });
            }
            return;
        }

        // 🎰 הימורים
        if (text.includes('הימור') || text.includes('בט') || (text.includes('שם') && text.match(/\d+/))) {
            const betRes = await casinoSystem.placeBet(senderId, senderName, 'whatsapp', text);
            if (betRes.status === 'success') {
                if (betRes.asset.endsWith('.mp4')) await sock.sendMessage(chatJid, { video: { url: betRes.asset }, caption: betRes.caption, gifPlayback: true }, { quoted: msg });
                else await sock.sendMessage(chatJid, { text: betRes.caption }, { quoted: msg });
            } else {
                await sock.sendMessage(chatJid, { text: betRes.message }, { quoted: msg });
            }
            return;
        }

        // --- סוף טריגרים עצמאיים ---

        // --- 1. בדיקת טריגרים לשיחה ---
        const isExplicitCall = isTriggered(text, msg, sock);
        
        // בדיקת רצף שיחה (אם דיברנו ב-2 דקות האחרונות)
        const lastInteraction = activeConversations.get(senderId);
        const isInConversation = lastInteraction && (Date.now() - lastInteraction < CONVERSATION_TIMEOUT);

        // אם זו לא פנייה ישירה וגם לא חלק משיחה רציפה -> הולכים לצופה השקט
        if (!isExplicitCall && !isInConversation) {
            
            // בדיקת Vision (רק אם ביקשו במפורש לראות לוח/סקור, או אם תויג, אחרת מתעלמים מתמונות סתמיות)
            if (mediaMsg && (text.includes('לוח') || text.includes('סקור') || text.includes('דמג'))) {
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

            // --- צופה שקט (למידה + במאי המדיה) ---
            await learningEngine.learnFromContext(senderId, senderName, 'whatsapp', text);
            const smartMedia = await mediaDirector.handleSmartResponse(text, senderId, 'whatsapp', senderName);
            if (smartMedia) {
                 if (smartMedia.type === 'audio_buffer') await sock.sendMessage(chatJid, { audio: smartMedia.data, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                 else if (smartMedia.type === 'sticker_url') await sock.sendMessage(chatJid, { sticker: { url: smartMedia.url } });
                 else if (smartMedia.type === 'video') await sock.sendMessage(chatJid, { video: { url: smartMedia.url }, gifPlayback: true });
            }
            return; // 🛑 שמעון שותק כאן
        }

        // --- הגיע לכאן? שמעון עונה! ---
        
        // עדכון זמן שיחה אחרון
        activeConversations.set(senderId, Date.now());

        // Vision כחלק משיחה
        if (mediaMsg) {
             const imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
             if (imageBuffer) {
                 const analysis = await visionSystem.analyzeImage(imageBuffer, 
                     `ניתוח תמונה כחלק משיחה. המשתמש אמר: "${text}".`
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
        const smartResponse = getSmartErrorResponse();
        if (smartResponse) {
            try { await sock.sendMessage(chatJid, { text: smartResponse }); } catch (sendErr) { }
        }
    }
}

module.exports = { handleMessageLogic };
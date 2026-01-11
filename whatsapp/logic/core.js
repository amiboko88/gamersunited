// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer'); 
const { isSystemActive } = require('../utils/timeHandler'); 
const { getUserRef } = require('../../utils/userUtils'); 
const matchmaker = require('../../handlers/matchmaker'); // ✅ ייבוא השדכן

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

function getSmartErrorResponse() {
    const now = Date.now();
    if (now - lastCrashReply > CRASH_COOLDOWN) {
        lastCrashReply = now;
        return MAINTENANCE_RESPONSES[Math.floor(Math.random() * MAINTENANCE_RESPONSES.length)];
    }
    return null;
}

const isDirectCall = (text) => text.includes('שמעון') || text.includes('בוט') || text.includes('@') || text.includes('שימי');

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];

    // --- 👑 נוהל מפעיל: טיפול בתשובת אדמין ---
    // האם זה האדמין, בפרטי, ועושה Reply?
    const isAdmin = senderPhone === '972526800647' || senderPhone === '508753233'; 
    const isDM = !chatJid.endsWith('@g.us');

    if (isAdmin && isDM) {
        // בודקים אם האדמין הגיב לדוח מודיעין של השדכן
        const handled = await matchmaker.handleAdminResponse(sock, msg, text);
        if (handled) return; // אם זה היה פקודת קישור - עוצרים כאן ולא ממשיכים ל-AI
    }

    // --- 🛑 בדיקה 0: שעות פעילות (שבת/לילה/צהריים) ---
    const systemStatus = isSystemActive();
    
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

    // --- ✅ זהות כפולה - תיקון (Ghost Buster) ---
    let realUserId = senderPhone;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        realUserId = userRef.id; 
    } catch (e) {
        console.error('Identity Resolution Failed:', e);
    }

    bufferSystem.addToBuffer(realUserId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, realUserId, chatJid);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid) {
    const senderName = msg.pushName || "גיימר";
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = senderFullJid.split('@')[0];

    try {
        await userManager.updateLastActive(senderId);
    } catch (e) { console.error('Error updating last active:', e); }

    if (text === "BLOCKED_SPAM") {
        const roast = await shimonBrain.ask(senderId, 'whatsapp', "אני מציף את הקבוצה בהודעות ספאם. רד עלי חזק.", false);
        await sock.sendMessage(chatJid, { text: `🚨 ${roast}` }, { quoted: msg });
        return;
    }

    try {
        // --- 🎂 2. מערכת ימי הולדת ---
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

        // --- 🎰 3. מערכת משחקים ---
        if (text.includes('רולטה')) {
            const result = await rouletteSystem.spinRoulette();
            if (result) {
                if (result.type === 'sticker') await sock.sendMessage(chatJid, { sticker: { url: result.path } });
                else await sock.sendMessage(chatJid, { video: { url: result.url }, gifPlayback: true });
            }
            return;
        }

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

        // --- 👁️ 4. מערכת Vision ---
        if (mediaMsg) {
            if (text.includes('דמג') || text.includes('לוח') || text.includes('סקור') || text.includes('ראה')) {
                const imageBuffer = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
                if (imageBuffer) {
                    const analysis = await visionSystem.analyzeImage(imageBuffer, 
                        `אתה שמעון. נתח את התמונה. אם זה לוח תוצאות, רד על מי שחלש ופרגן למי שחזק. הטקסט של המשתמש: "${text}"`
                    );
                    if (analysis) await sock.sendMessage(chatJid, { text: analysis }, { quoted: msg });
                    return;
                }
            }
        }

        // --- 🕵️ 5. הצופה השקט + במאי המדיה ---
        if (!isDirectCall(text)) {
            await learningEngine.learnFromContext(senderId, senderName, 'whatsapp', text);
            const smartMedia = await mediaDirector.handleSmartResponse(text, senderId, 'whatsapp', senderName);
            
            if (smartMedia) {
                if (smartMedia.type === 'audio_buffer') await sock.sendMessage(chatJid, { audio: smartMedia.data, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                else if (smartMedia.type === 'sticker_url') await sock.sendMessage(chatJid, { sticker: { url: smartMedia.url } });
                else if (smartMedia.type === 'video') await sock.sendMessage(chatJid, { video: { url: smartMedia.url }, gifPlayback: true });
            }
            return;
        }

        // --- 🧠 6. המוח המרכזי ---
        await sock.sendPresenceUpdate('composing', chatJid);
        const isAdmin = senderPhone === '972526800647' || senderPhone === '508753233'; 
        const aiResponse = await shimonBrain.ask(senderId, 'whatsapp', text, isAdmin);
        await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });

    } catch (error) {
        log(`❌ [Core] Fatal Error inside executeCoreLogic: ${error.message}`);
        const smartResponse = getSmartErrorResponse();
        if (smartResponse) {
            try { await sock.sendMessage(chatJid, { text: smartResponse }); } catch (sendErr) { }
        }
    }
}

module.exports = { handleMessageLogic };
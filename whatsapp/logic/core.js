// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer'); // מנגנון באפר למניעת ספאם
const { isSystemActive } = require('../utils/timeHandler'); // ✅ חובה: ייבוא הבודק שעות

// --- ייבוא כל המערכות המרכזיות (Handlers) ---
// אלו המערכות ששידרגנו לתיקייה הראשית כדי למנוע כפילויות
const shimonBrain = require('../../handlers/ai/brain');         // המוח (עזרה ושיחה)
const learningEngine = require('../../handlers/ai/learning');   // הצופה השקט (למידה)
const birthdayManager = require('../../handlers/birthday/manager'); // ימי הולדת
const casinoSystem = require('../../handlers/economy/casino');  // קזינו
const rouletteSystem = require('../../handlers/economy/roulette'); // רולטה
const visionSystem = require('../../handlers/media/vision');    // ראייה (ניתוח תמונות)
const generatorSystem = require('../../handlers/media/generator'); // יצירת תמונות (Replicate)
const mediaDirector = require('../../handlers/media/director'); // הבמאי החדש (במקום triggers)
const userManager = require('../../handlers/users/manager');    // ניהול משתמשים (פעילות)

// --- 🛠️ הגדרות מצב תחזוקה חכם 🛠️ ---
let lastCrashReply = 0;
const CRASH_COOLDOWN = 1000 * 60 * 15; // מגיב לשגיאות רק פעם ב-15 דקות

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
// ----------------------------------------

// עזרים
const isDirectCall = (text) => text.includes('שמעון') || text.includes('בוט') || text.includes('@');

/**
 * נקודת הכניסה ללוגיקה (אחרי Buffer)
 * מקבלת את ההודעה, מאחדת אותה אם צריך, ומעבירה לביצוע
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // --- 🛑 בדיקה 0: שעות פעילות (שבת/לילה/צהריים) ---
    const systemStatus = isSystemActive();
    if (!systemStatus.active) {
        const isAdmin = senderId === '972526800647' || senderId === '526800647';
        if (!isAdmin) {
            return; 
        }
    }

    // מכאן ממשיך הקוד הרגיל (Buffer וכו')...
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId, chatJid);
    });
}

/**
 * הלוגיקה הראשית - מוח אחד ששולט על הכל
 */
async function executeCoreLogic(sock, msg, text, mediaMsg, senderId, chatJid) {
    const senderName = msg.pushName || "גיימר";

    // --- 0. עדכון זמן פעילות (User Activity) ---
    try {
        await userManager.updateLastActive(senderId);
    } catch (e) {
        console.error('Error updating last active:', e);
    }

    // --- 1. הגנה מספאם (אם הבאפר סימן כ-BLOCKED) ---
    if (text === "BLOCKED_SPAM") {
        const roast = await shimonBrain.ask(senderId, 'whatsapp', "אני מציף את הקבוצה בהודעות ספאם. רד עלי חזק.", false);
        await sock.sendMessage(chatJid, { text: `🚨 ${roast}` }, { quoted: msg });
        return;
    }

    try {
        // --- 🎂 2. מערכת ימי הולדת (זיהוי תאריך אוטומטי) ---
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
            } catch (e) {
                // תאריך לא תקין
            }
        }

        // --- 🎰 3. מערכת משחקים וכלכלה ---
        
        // רולטה
        if (text.includes('רולטה')) {
            const result = await rouletteSystem.spinRoulette();
            if (result) {
                if (result.type === 'sticker') {
                    await sock.sendMessage(chatJid, { sticker: { url: result.path } });
                } else {
                    await sock.sendMessage(chatJid, { video: { url: result.url }, gifPlayback: true });
                }
            }
            return;
        }

        // קזינו / הימורים
        if (text.includes('הימור') || text.includes('בט') || (text.includes('שם') && text.match(/\d+/))) {
            const betRes = await casinoSystem.placeBet(senderId, senderName, 'whatsapp', text);
            
            if (betRes.status === 'success') {
                if (betRes.asset.endsWith('.mp4')) {
                    await sock.sendMessage(chatJid, { video: { url: betRes.asset }, caption: betRes.caption, gifPlayback: true }, { quoted: msg });
                } else {
                    await sock.sendMessage(chatJid, { text: betRes.caption }, { quoted: msg });
                }
            } else {
                await sock.sendMessage(chatJid, { text: betRes.message }, { quoted: msg });
            }
            return;
        }

        // --- 👁️ 4. מערכת Vision (אם יש תמונה) ---
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

        // --- 🕵️ 5. הצופה השקט + במאי המדיה (כשלא פנו לבוט) ---
        if (!isDirectCall(text)) {
            // א. למידה שקטה
            await learningEngine.learnFromContext(senderId, senderName, 'whatsapp', text);
            
            // ב. במאי המדיה
            const smartMedia = await mediaDirector.handleSmartResponse(text, senderId, 'whatsapp', senderName);
            
            if (smartMedia) {
                if (smartMedia.type === 'audio_buffer') {
                    await sock.sendMessage(chatJid, { audio: smartMedia.data, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                } else if (smartMedia.type === 'sticker_url') {
                    await sock.sendMessage(chatJid, { sticker: { url: smartMedia.url } });
                } else if (smartMedia.type === 'video') {
                    await sock.sendMessage(chatJid, { video: { url: smartMedia.url }, gifPlayback: true });
                }
            }
            return;
        }

        // --- 🧠 6. המוח המרכזי (AI Chat & Help) ---
        await sock.sendPresenceUpdate('composing', chatJid);
        const isAdmin = senderId === '972526800647' || senderId === '526800647'; 
        const aiResponse = await shimonBrain.ask(senderId, 'whatsapp', text, isAdmin);

        await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });

    } catch (error) {
        // ✅ התיקון היחיד: טיפול חכם בשגיאות במקום סתם לוג
        log(`❌ [Core] Fatal Error inside executeCoreLogic: ${error.message}`);
        
        const smartResponse = getSmartErrorResponse();
        if (smartResponse) {
            try {
                await sock.sendMessage(chatJid, { text: smartResponse });
            } catch (sendErr) {
                console.error('Failed to send error response:', sendErr);
            }
        }
    }
}

module.exports = { handleMessageLogic };
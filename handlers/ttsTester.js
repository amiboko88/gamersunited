// 📁 handlers/ttsTester.js
// 🔍 גרסת אבחון סופית
// ✅ [שדרוג] ה-ID של ערוץ הבדיקות הוכנס ישירות לקוד

const { log } = require('../utils/logger');
const podcastManager = require('./podcastManager');

// --- הגדרות ---
const TEST_CHANNEL_ID = '1396779274173943828'; // ⬅️ ה-ID שלך הוכנס כאן
let isTestRunning = false;

/**
 * הפונקציה המרכזית ש-voiceHandler קורא לה.
 * מפעילה סימולציית פודקאסט אישי עבור המשתמש שמתחבר.
 * @param {import('discord.js').GuildMember} member
 */
async function runTTSTest(member) {
    if (isTestRunning) {
        log('[TTS_TESTER] ⚠️ בדיקה כבר רצה, מדלג על הבקשה החדשה.');
        return;
    }
    isTestRunning = true;
    
    log(`[TTS_TESTER] ➡️  התחלת בדיקת פודקאסט מלאה עבור ${member.displayName}`);

    try {
        await podcastManager.playPersonalPodcast(
            member.voice.channel,
            member,
            member.client
        );
        log(`[TTS_TESTER] ✅ בקשת הפודקאסט נשלחה בהצלחה למנהל התורים.`);

    } catch (error) {
        log(`[TTS_TESTER] ❌ שגיאה קריטית נתפסה! מפענח את מקור התקלה...`);
        
        if (error instanceof Error) {
            log(`[TTS_TESTER] [שם השגיאה]: ${error.name}`);
            log(`[TTS_TESTER] [הודעת השגיאה]: ${error.message}`);
            log(`[TTS_TESTER] [Stack Trace]:`);
            log(error.stack);
        } else {
            log('[TTS_TESTER] [תוכן השגיאה (לא סטנדרטי)]:', error);
        }

    } finally {
        setTimeout(() => {
            isTestRunning = false;
            log('[TTS_TESTER] ⏹️  ניתן להפעיל בדיקת פודקאסט נוספת.');
        }, 15000); // 15 שניות צינון
    }
}

module.exports = {
    runTTSTest,
    TEST_CHANNEL_ID // ✅ [שדרוג] ה-ID מיוצא שוב כדי ש-voiceHandler ישתמש בו
};
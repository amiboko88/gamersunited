// 📁 handlers/ttsTester.js
// 🔍 גרסת אבחון עם לוגיקת "מלכודת שגיאות" משופרת

const { log } = require('../utils/logger');
const podcastManager = require('./podcastManager');

// --- הגדרות ---
const TEST_CHANNEL_ID = '1396779274173943828';
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
        // --- 🔍 מלכודת השגיאות המשופרת 🔍 ---
        log(`[TTS_TESTER] ❌ שגיאה קריטית נתפסה! מנסה לפענח את מקור התקלה...`);
        
        if (error instanceof Error) {
            // אם זו שגיאה סטנדרטית, נדפיס את ה-stack trace המלא
            log('[TTS_TESTER] [סוג השגיאה]: Error Object');
            log('[TTS_TESTER] [Stack Trace]:', error.stack);
        } else if (typeof error === 'object' && error !== null) {
            // אם זה אובייקט כללי, ננסה להמיר אותו לטקסט
            log('[TTS_TESTER] [סוג השגיאה]: Object');
            try {
                log('[TTS_TESTER] [תוכן האובייקט]:', JSON.stringify(error, null, 2));
            } catch (jsonError) {
                log('[TTS_TESTER] ⚠️ לא ניתן היה להמיר את אובייקט השגיאה ל-JSON.');
            }
        } else {
            // אם זה משהו אחר (למשל, טקסט, מספר, או undefined)
            log('[TTS_TESTER] [סוג השגיאה]: Primitive or Unknown');
            log('[TTS_TESTER] [תוכן השגיאה]:', error);
        }
        // -----------------------------------------

    } finally {
        setTimeout(() => {
            isTestRunning = false;
            log('[TTS_TESTER] ⏹️  ניתן להפעיל בדיקת פודקאסט נוספת.');
        }, 15000);
    }
}

module.exports = {
    runTTSTest,
    TEST_CHANNEL_ID
};
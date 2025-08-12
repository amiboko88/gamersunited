// 📁 handlers/ttsTester.js
// ✅ גרסה חדשה המדמה הפעלת פודקאסט מלא לבדיקה

const { log } = require('../utils/logger');
const podcastManager = require('./podcastManager'); // ייבוא של מנהל הפודקאסט

// --- הגדרות ---
const TEST_CHANNEL_ID = '1396779274173943828'; // ניתן לשנות למשתנה סביבה אם רוצים
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
        // קוראים ישירות לפונקציית "הבמאי" של הפודקאסט.
        // היא תבנה את התסריט, תייצר את האודיו ותוסיף לתור הניגון.
        await podcastManager.playPersonalPodcast(
            member.voice.channel,
            member,
            member.client
        );
        log(`[TTS_TESTER] ✅ בקשת הפודקאסט נשלחה בהצלחה למנהל התורים.`);
        
        // אין צורך לנהל כאן חיבור קולי או נגן. 
        // voiceQueue.js אחראי על כך באופן מלא, וזה בדיוק מה שאנחנו בודקים.

    } catch (error) {
        log.error(`[TTS_TESTER] ❌ שגיאה קריטית בתהליך בדיקת הפודקאסט:`, error);
    } finally {
        // נוסיף צינון קצר כדי למנוע הפעלה כפולה בטעות
        // ולאפשר לתור להתחיל לעבוד לפני שניתן להפעיל בדיקה נוספת.
        setTimeout(() => {
            isTestRunning = false;
            log('[TTS_TESTER] ⏹️  ניתן להפעיל בדיקת פודקאסט נוספת.');
        }, 15000); // צינון של 15 שניות
    }
}

module.exports = {
    runTTSTest, // שם הפונקציה נשמר לתאימות עם voiceHandler
    TEST_CHANNEL_ID
};
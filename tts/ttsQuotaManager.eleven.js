// 📁 tts/ttsQuotaManager.openai.js (שם הקובץ נשאר ttsQuotaManager.eleven.js אצלך)
const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');

const USAGE_COLLECTION = 'openAiTtsUsage'; // ✅ [שדרוג] קולקציה חדשה למעקב נקי

/**
 * רושם שימוש בודד ב-TTS ב-Firestore.
 */
async function registerTTSUsage(characterCount, userId, username, engine, voiceProfile) {
    if (characterCount <= 0) return;
    try {
        const usageData = {
            userId,
            username,
            characterCount,
            engine,
            voiceProfile,
            timestamp: new Date(),
        };
        await db.collection(USAGE_COLLECTION).add(usageData);
    } catch (error) {
        log(`❌ [QUOTA] שגיאה ברישום שימוש ב-OpenAI: ${error.message}`);
    }
}

/**
 * שולף את כל נתוני השימוש הגולמיים עבור פקודת הסלאש.
 */
async function getTTSUsageData() {
    try {
        const snapshot = await db.collection(USAGE_COLLECTION).get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        log(`❌ [QUOTA] שגיאה בשליפת נתוני שימוש מ-OpenAI: ${error.message}`);
        return null;
    }
}

// ⚠️ הערה: ל-OpenAI אין API פשוט לבדיקת יתרה שוטפת כמו ל-ElevenLabs,
// לכן הסרנו את הפונקציה getQuota. המעקב יתבצע ב-Firestore ובדשבורד של OpenAI.

module.exports = {
    registerTTSUsage,
    getTTSUsageData,
    USAGE_COLLECTION,
};
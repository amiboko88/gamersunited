// 📁 tts/ttsQuotaManager.eleven.js

const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');

const USAGE_COLLECTION = 'googleTtsUsage';

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
        log.error('❌ [QUOTA] שגיאה ברישום שימוש ב-TTS:', error);
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
        log.error('❌ [QUOTA] שגיאה בשליפת נתוני שימוש:', error);
        return null;
    }
}

module.exports = {
    registerTTSUsage,
    getTTSUsageData,
    USAGE_COLLECTION, // מיוצא כדי למנוע כפילויות של שם הקולקציה
};
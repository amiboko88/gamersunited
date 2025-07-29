// 📁 handlers/tts/ttsQuotaManager.eleven.js (עכשיו מנהל מכסות גוגל)

const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

const USAGE_COLLECTION = 'googleTtsUsage'; // קולקציה חדשה לדוחות נקיים

/**
 * רושם שימוש ב-TTS ב-Firestore.
 * @param {number} characterCount - מספר התווים שנוצלו.
 * @param {string} userId - ID המשתמש שהפעיל את ה-TTS.
 * @param {string} username - שם המשתמש.
 * @param {string} engine - שם המנוע (למשל, 'Google').
 * @param {string} voiceProfile - שם פרופิล הדיבור שנוצל.
 */
async function registerTTSUsage(characterCount, userId, username, engine, voiceProfile) {
    if (characterCount === 0) return;

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
        log(`[QUOTA] נרשם שימוש של ${characterCount} תווים עבור ${username}.`);
    } catch (error) {
        log.error('❌ [QUOTA] שגיאה ברישום שימוש ב-TTS:', error);
    }
}

// פונקציית בדיקת המכסה נשארת כדמה, כיוון שההגבלה היא ב-Google Console
async function checkQuota() {
    return { canUse: true };
}

module.exports = {
    registerTTSUsage,
    checkQuota,
    USAGE_COLLECTION, // נייצא את שם הקולקציה כדי שפקודת הסלאש תשתמש בו
};
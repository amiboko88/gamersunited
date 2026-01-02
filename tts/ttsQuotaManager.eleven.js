// 📁 tts/ttsQuotaManager.eleven.js (מעודכן)
const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');
const { getUserRef } = require('../utils/userUtils'); // ✅
const admin = require('firebase-admin');

const USAGE_COLLECTION = 'openAiTtsUsage'; 

/**
 * רושם שימוש ב-TTS: גם בלוג המפורט וגם בפרופיל המשתמש.
 */
async function registerTTSUsage(characterCount, userId, username, engine, voiceProfile) {
    if (characterCount <= 0) return;
    
    try {
        const timestamp = new Date();

        // 1. שמירה ללוג המפורט (כמו שביקשת להשאיר)
        const usageData = {
            userId,
            username,
            characterCount,
            engine,
            voiceProfile,
            timestamp: timestamp,
        };
        const logPromise = db.collection(USAGE_COLLECTION).add(usageData);

        // 2. עדכון מצטבר בפרופיל המשתמש (Unified User DB)
        // אם ה-ID הוא מספר טלפון או ID של דיסקורד, ה-UserUtils ידע לטפל בזה
        const userRef = await getUserRef(userId, 'discord'); // מניח דיסקורד כברירת מחדל, אבל יעבוד גם אם תעביר פורמט אחר
        
        const userPromise = userRef.set({
            stats: {
                aiCharsUsed: admin.firestore.FieldValue.increment(characterCount)
            },
            meta: {
                lastActive: timestamp.toISOString()
            }
        }, { merge: true });

        await Promise.all([logPromise, userPromise]);
        
    } catch (error) {
        log(`❌ [QUOTA] שגיאה ברישום שימוש ב-TTS: ${error.message}`);
    }
}

async function getTTSUsageData() {
    try {
        const snapshot = await db.collection(USAGE_COLLECTION).get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        return [];
    }
}

module.exports = {
    registerTTSUsage,
    getTTSUsageData
};
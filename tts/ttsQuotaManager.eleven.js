// 📁 tts/ttsQuotaManager.eleven.js
const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');
const { getUserRef } = require('../utils/userUtils'); // ✅ החיבור למאגר המאוחד
const admin = require('firebase-admin');

const USAGE_COLLECTION = 'openAiTtsUsage'; 

/**
 * רושם שימוש ב-TTS: גם בלוג המפורט וגם בפרופיל המשתמש.
 */
async function registerTTSUsage(characterCount, userId, username, engine, voiceProfile) {
    if (characterCount <= 0) return;
    
    try {
        const timestamp = new Date();

        // 1. שמירה ללוג המפורט (כמו שביקשת להשאיר - לביקורת כספית)
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
        // השדרוג: סופרים כמה המשתמש הזה "עלה" לנו
        const userRef = await getUserRef(userId, 'discord'); 
        
        const userPromise = userRef.set({
            stats: {
                aiCharsUsed: admin.firestore.FieldValue.increment(characterCount)
            },
            meta: {
                lastActive: timestamp.toISOString()
            }
        }, { merge: true });

        // ביצוע במקביל לביצועים מהירים
        await Promise.all([logPromise, userPromise]);
        
    } catch (error) {
        // אנחנו לא רוצים שהבוט יקרוס בגלל לוג, אז רק מדפיסים שגיאה
        log(`❌ [QUOTA] שגיאה ברישום שימוש ב-TTS: ${error.message}`);
    }
}

/**
 * פונקציה למשיכת דוח שימוש גלובלי (עבור פקודת /תווים)
 */
async function getTTSUsageData() {
    try {
        const snapshot = await db.collection(USAGE_COLLECTION).get();
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Error fetching TTS usage data:', error);
        return [];
    }
}

module.exports = { registerTTSUsage, getTTSUsageData };
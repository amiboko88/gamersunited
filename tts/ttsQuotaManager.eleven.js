// 📁 tts/ttsQuotaManager.eleven.js

const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');
const { ElevenLabs } = require('@elevenlabs/elevenlabs-js');

const USAGE_COLLECTION = 'elevenTtsUsage'; // קולקציה חדשה

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
        log(`❌ [QUOTA] שגיאה ברישום שימוש ב-ElevenLabs: ${error.message}`);
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
        log(`❌ [QUOTA] שגיאה בשליפת נתוני שימוש מ-ElevenLabs: ${error.message}`);
        return null;
    }
}

/**
 * שולף את מצב המכסה הנוכחי ישירות מה-API של ElevenLabs.
 * @returns {Promise<{total: number, used: number, remaining: number, percentUsed: string}|null>}
 */
async function getElevenLabsQuota() {
    // ✅ [תיקון] הוחלף לשם משתנה הסביבה הנכון
    if (!process.env.ELEVEN_API_KEY) {
        log('⚠️ [QUOTA] לא ניתן לשלוף מכסת ElevenLabs. המפתח (ELEVEN_API_KEY) אינו מוגדר.');
        return null;
    }
    
    try {
        // ✅ [תיקון]
        const elevenLabs = new ElevenLabs({ apiKey: process.env.ELEVEN_API_KEY });
        const sub = await elevenLabs.user.getSubscription();
        
        const total = sub.character_limit;
        const used = sub.character_count;
        const remaining = total - used;
        const percentUsed = ((used / total) * 100).toFixed(2);
        
        return { total, used, remaining, percentUsed };
        
    } catch (error) {
        log(`❌ [QUOTA] שגיאה בשליפת מידע מנוי מ-ElevenLabs: ${error.message}`);
        return null;
    }
}

module.exports = {
    registerTTSUsage,
    getTTSUsageData,
    getElevenLabsQuota, // מיוצא לשימוש ב-engine
    USAGE_COLLECTION,
};
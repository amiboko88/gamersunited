// 📁 tts/ttsQuotaManager.eleven.js

const db = require('../utils/firebase.js');
const { log } = require('../utils/logger.js');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

const USAGE_COLLECTION = 'elevenTtsUsage'; 

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

async function getElevenLabsQuota() {
    if (!process.env.ELEVEN_API_KEY) {
        log('⚠️ [QUOTA] לא ניתן לשלוף מכסת ElevenLabs. המפתח (ELEVEN_API_KEY) אינו מוגדר.');
        return null;
    }
    
    try {
        const elevenLabs = new ElevenLabsClient({ apiKey: process.env.ELEVEN_API_KEY }); 
        const userInfo = await elevenLabs.user.get(); 
        
        // ✅ [שדרוג לוג] בודקים אם המידע על המנוי קיים
        if (!userInfo || !userInfo.subscription) {
            log('⚠️ [QUOTA] לא נמצא אובייקט "subscription" במידע המשתמש. ייתכן שהתוכנית אינה נתמכת API.');
            return null;
        }
        
        const sub = userInfo.subscription; 
        
        const total = sub.character_limit;
        const used = sub.character_count;
        const remaining = total - used;
        const percentUsed = ((used / total) * 100).toFixed(2);
        
        return { total, used, remaining, percentUsed };
        
    } catch (error) {
        // ✅ [שדרוג לוג] מדפיסים את כל השגיאה
        log(`❌ [QUOTA] שגיאה קריטית בשליפת מידע מנוי מ-ElevenLabs: ${error.message}`);
        log(error); // הדפסת אובייקט השגיאה המלא
        return null;
    }
}

module.exports = {
    registerTTSUsage,
    getTTSUsageData,
    getElevenLabsQuota, 
    USAGE_COLLECTION,
};
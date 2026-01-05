// 📁 utils/botStateManager.js
const db = require('./firebase');

// שמירה בתוך קולקשן המטא-דאטה כדי לשמור על סדר
const SYSTEM_COLLECTION = 'system_metadata';

async function loadBotState(stateKey) {
    try {
        const docRef = db.collection(SYSTEM_COLLECTION).doc(`state_${stateKey}`);
        const doc = await docRef.get();
        
        if (doc.exists) {
            // console.log(`[STATE] טען מצב עבור ${stateKey}`);
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error(`[STATE] ❌ שגיאה בטעינת מצב עבור ${stateKey}:`, error);
        return null;
    }
}

async function saveBotState(stateKey, stateData) {
    try {
        const docRef = db.collection(SYSTEM_COLLECTION).doc(`state_${stateKey}`);
        // משתמשים ב-merge כדי לא לדרוס שדות אחרים אם נוסיף בעתיד
        await docRef.set({
            ...stateData,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // console.log(`[STATE] מצב נשמר עבור ${stateKey}`);
    } catch (error) {
        console.error(`[STATE] ❌ שגיאה בשמירת מצב עבור ${stateKey}:`, error);
    }
}

module.exports = {
    loadBotState,
    saveBotState
};
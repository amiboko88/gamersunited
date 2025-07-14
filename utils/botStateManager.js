// 📁 utils/botStateManager.js
const db = require('./firebase');
const STATE_COLLECTION = 'botStates'; 

async function loadBotState(stateKey) {
    try {
        const docRef = db.collection(STATE_COLLECTION).doc(stateKey);
        const doc = await docRef.get();
        if (doc.exists) {
            console.log(`[STATE] טען מצב עבור ${stateKey}:`, doc.data());
            return doc.data();
        }
        console.log(`[STATE] לא נמצא מצב שמור עבור ${stateKey}.`);
        return null;
    } catch (error) {
        console.error(`[STATE] ❌ שגיאה בטעינת מצב עבור ${stateKey}:`, error);
        return null;
    }
}

async function saveBotState(stateKey, stateData) {
    try {
        const docRef = db.collection(STATE_COLLECTION).doc(stateKey);
        await docRef.set(stateData, { merge: true });
        console.log(`[STATE] מצב נשמר עבור ${stateKey}:`, stateData);
    } catch (error) {
        console.error(`[STATE] ❌ שגיאה בשמירת מצב עבור ${stateKey}:`, error);
    }
}

module.exports = {
    loadBotState,
    saveBotState
};
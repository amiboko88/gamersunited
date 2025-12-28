// 📁 handlers/firebaseAuth.js
const { proto } = require('@whiskeysockets/baileys');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

// משתמשים בחיבור הקיים שלך
const db = require('../utils/firebase'); 

const COLLECTION_NAME = 'whatsapp_auth';
const DOC_ID = 'shimon_session';

async function useFirestoreAuthState() {
    // הפניה למסמך הראשי ולתת-קולקציה של המפתחות
    const docRef = db.collection(COLLECTION_NAME).doc(DOC_ID);
    const keysCollection = docRef.collection('keys');

    // 1. טעינת ה-Creds (פרטי הזיהוי הראשיים)
    const docSnapshot = await docRef.get();
    const creds = docSnapshot.exists 
        ? JSON.parse(docSnapshot.data().creds, BufferJSON.reviver) 
        : initAuthCreds();

    // 2. פונקציית שמירה (תרוץ בכל פעם שיש שינוי)
    const saveCreds = async () => {
        const jsonCreds = JSON.stringify(creds, BufferJSON.replacer, 2);
        await docRef.set({ creds: jsonCreds }, { merge: true });
    };

    return {
        state: {
            creds,
            keys: {
                // שליפת מפתחות
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        const keyId = `${type}-${id}`;
                        const keyDoc = await keysCollection.doc(keyId).get();
                        if (keyDoc.exists) {
                            let value = keyDoc.data().value;
                            // המרה חזרה מ-JSON לאובייקט
                            value = JSON.parse(value, BufferJSON.reviver);
                            // תיקון ספציפי ל-app-state-sync-key
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                // שמירת מפתחות
                set: async (data) => {
                    const batch = db.batch();
                    let operationCount = 0;

                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const keyId = `${category}-${id}`;
                            const keyRef = keysCollection.doc(keyId);

                            if (value) {
                                const jsonValue = JSON.stringify(value, BufferJSON.replacer, 2);
                                batch.set(keyRef, { value: jsonValue });
                            } else {
                                batch.delete(keyRef);
                            }
                            
                            operationCount++;
                            // Firestore מגביל באצ'ים ל-500 פעולות
                            if (operationCount >= 400) {
                                await batch.commit();
                                operationCount = 0; // איפוס
                            }
                        }
                    }
                    if (operationCount > 0) await batch.commit();
                }
            }
        },
        saveCreds
    };
}

module.exports = { useFirestoreAuthState };
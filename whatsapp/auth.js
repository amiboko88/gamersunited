const { proto } = require('@whiskeysockets/baileys');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');
const db = require('../utils/firebase'); 

const COLLECTION_NAME = 'whatsapp_auth';
const DOC_ID = 'shimon_session';

async function useFirestoreAuthState() {
    const docRef = db.collection(COLLECTION_NAME).doc(DOC_ID);
    const keysCollection = docRef.collection('keys');

    let creds;
    try {
        const docSnapshot = await docRef.get();
        if (docSnapshot.exists && docSnapshot.data().creds) {
            creds = JSON.parse(docSnapshot.data().creds, BufferJSON.reviver);
        } else {
            creds = initAuthCreds();
        }
    } catch (error) {
        creds = initAuthCreds();
    }

    const saveCreds = async () => {
        try {
            const jsonCreds = JSON.stringify(creds, BufferJSON.replacer, 2);
            await docRef.set({ creds: jsonCreds }, { merge: true });
        } catch (error) {
            console.error('Error saving creds:', error.message);
        }
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    try {
                        await Promise.all(ids.map(async (id) => {
                            const keyId = `${type}-${id}`.replace(/\//g, '__'); 
                            const keyDoc = await keysCollection.doc(keyId).get();
                            if (keyDoc.exists && keyDoc.data().value) {
                                let value = JSON.parse(keyDoc.data().value, BufferJSON.reviver);
                                if (type === 'app-state-sync-key') {
                                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                }
                                data[id] = value;
                            }
                        }));
                    } catch (error) {}
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const keyId = `${category}-${id}`.replace(/\//g, '__');
                            const keyRef = keysCollection.doc(keyId);

                            if (value) {
                                const jsonValue = JSON.stringify(value, BufferJSON.replacer, 2);
                                tasks.push({ type: 'set', ref: keyRef, data: { value: jsonValue } });
                            } else {
                                tasks.push({ type: 'delete', ref: keyRef });
                            }
                        }
                    }

                    const BATCH_SIZE = 100;
                    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
                        const batch = db.batch();
                        const chunk = tasks.slice(i, i + BATCH_SIZE);
                        chunk.forEach(task => {
                            if (task.type === 'set') batch.set(task.ref, task.data);
                            else batch.delete(task.ref);
                        });
                        try { await batch.commit(); } catch (err) {}
                    }
                }
            }
        },
        saveCreds
    };
}

module.exports = { useFirestoreAuthState };
// 📁 utils/userUtils.js
const db = require('./firebase');

function cleanWhatsAppId(id) {
    if (!id) return id;
    if (/^\d+$/.test(id)) return id;
    return id.split('@')[0].replace(/\D/g, '');
}

async function getUserRef(id, platform = 'discord') {
    if (platform === 'discord') return db.collection('users').doc(id);

    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id.toString();
    const isLid = platform === 'whatsapp' && cleanId.length > 14; 

    // 1. חיפוש ראשי בתיקי האב (users)
    let snapshot = await db.collection('users').where(`platforms.${platform}`, '==', cleanId).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].ref;

    // 2. חיפוש LID
    if (isLid) {
        snapshot = await db.collection('users').where('platforms.whatsapp_lid', '==', cleanId).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // 3. חיפוש מספר ישן
    if (platform === 'whatsapp' && !isLid) {
        const possibleOldId = cleanId.startsWith('972') ? cleanId : `972${cleanId.replace(/^0+/, '')}`;
        snapshot = await db.collection('users').where('identity.whatsappPhone', 'in', [cleanId, possibleOldId]).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // אם לא מצאנו - מחזירים כתובת פיקטיבית (אבל לא יוצרים אותה)
    return db.collection('users').doc(cleanId);
}

async function getUserData(id, platform = 'discord') {
    try {
        const ref = await getUserRef(id, platform);
        const doc = await ref.get();
        if (!doc.exists) return null;
        return doc.data();
    } catch (error) {
        console.error(`❌ [UserUtils] Get Data Error:`, error);
        return null;
    }
}

async function ensureUserExists(id, displayName, platform = 'discord') {
    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id;
    const isLid = platform === 'whatsapp' && cleanId.length > 14; 
    const ref = await getUserRef(id, platform);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: המשתמש לא קיים ב-DB
            if (!doc.exists) {
                // 🛑 וואטסאפ: לא יוצרים!
                if (platform === 'whatsapp') {
                    console.warn(`🛡️ [UserUtils] משתמש לא מזוהה (${cleanId}). מחזיר NULL לשדכן.`);
                    return; // מחזיר undefined -> ייחשב כ-false ב-index
                }

                // דיסקורד: יוצרים כרגיל
                console.log(`🆕 [UserUtils] Creating Discord profile: ${displayName}`);
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown",
                        joinedAt: new Date().toISOString(),
                        discordId: id
                    },
                    platforms: { discord: id },
                    economy: { xp: 0, level: 1, balance: 0 },
                    stats: { messagesSent: 0, voiceMinutes: 0 },
                    brain: { facts: [], roasts: [] },
                    meta: { firstSeen: new Date().toISOString(), lastActive: new Date().toISOString() },
                    tracking: { status: 'active' }
                };
                t.set(ref, newUser);
            } 
            // תרחיש 2: משתמש קיים (עדכון)
            else {
                const data = doc.data();
                const updates = { 'meta.lastActive': new Date().toISOString() };

                // קישור LID אם צריך
                if (isLid) {
                    if (data.platforms?.whatsapp_lid !== cleanId) {
                        updates['platforms.whatsapp_lid'] = cleanId;
                        console.log(`🔗 [UserUtils] קושר LID (${cleanId}) למשתמש קיים.`);
                    }
                } else {
                    if (!data.platforms || !data.platforms[platform]) {
                        updates[`platforms.${platform}`] = cleanId;
                    }
                }
                
                t.set(ref, updates, { merge: true });
            }
        });
        
        // טריק קטן: אם הטרנזקציה לא יצרה מסמך (כי החזרנו return באמצע), ה-Ref עדיין קיים כאובייקט
        // אבל ב-Index אנחנו נבדוק שוב עם get()
        return ref;

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref;
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 * מחפש ישירות בתוך users לפי שדה הפלטפורמה.
 */
async function getUserRef(id, platform = 'discord') {
    // 1. דיסקורד = מפתח ישיר
    if (platform === 'discord') {
        return db.collection('users').doc(id);
    }

    // 2. וואטסאפ = חיפוש לפי שדה platforms.whatsapp
    if (platform === 'whatsapp') {
        // מנקים את ה-JID אם צריך (משאירים רק מספר)
        const cleanPhone = id.replace('@s.whatsapp.net', '').replace('WA:', '');
        
        try {
            const snapshot = await db.collection('users')
                .where('platforms.whatsapp', '==', cleanPhone)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                return snapshot.docs[0].ref; // מצאנו קישור!
            }
        } catch (error) {
            console.error(`❌ User Lookup Error (${id}):`, error);
        }

        // 3. אם לא מצאנו, ניצור מסמך חדש על בסיס הטלפון
        return db.collection('users').doc(cleanPhone);
    }

    return db.collection('users').doc(id);
}

async function getUserData(id, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return doc.data();
}

async function ensureUserExists(id, displayName, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);

        if (!doc.exists) {
            const cleanId = id.replace('@s.whatsapp.net', '');
            const newUser = {
                identity: {
                    displayName: displayName || "Unknown Gamer",
                    joinedAt: new Date().toISOString()
                },
                platforms: {
                    [platform]: cleanId
                },
                economy: { xp: 0, level: 1, balance: 0 },
                stats: { messagesSent: 0 },
                brain: { facts: [], roasts: [] },
                meta: { firstSeen: new Date().toISOString() }
            };
            t.set(ref, newUser);
        } else {
            t.set(ref, { 
                'identity.displayName': displayName,
                'meta.lastActive': new Date().toISOString()
            }, { merge: true });
        }
    });

    return (await ref.get()).data();
}

module.exports = { getUserRef, getUserData, ensureUserExists };
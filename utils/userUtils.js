// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 * מחפש ישירות בתוך users לפי שדה הפלטפורמה.
 * @param {string} id - המזהה (Discord ID, Phone Number, Telegram ID)
 * @param {string} platform - הפלטפורמה ('discord', 'whatsapp', 'telegram')
 */
async function getUserRef(id, platform = 'discord') {
    // 1. דיסקורד = מפתח ישיר (ה-ID של המסמך הוא ה-Discord ID)
    if (platform === 'discord') {
        return db.collection('users').doc(id);
    }

    // 2. פלטפורמות אחרות (וואטסאפ / טלגרם) - חיפוש לפי שדה מקושר
    const fieldMap = {
        'whatsapp': 'platforms.whatsapp',
        'telegram': 'platforms.telegram'
    };

    const searchField = fieldMap[platform];
    if (searchField) {
        // ניקוי מזהים (למשל בוואטסאפ מורידים את ה-suffix)
        const cleanId = platform === 'whatsapp' 
            ? id.replace('@s.whatsapp.net', '').replace('WA:', '')
            : id.toString();

        try {
            // חיפוש משתמש קיים שיש לו את ה-ID הזה מקושר
            const snapshot = await db.collection('users')
                .where(searchField, '==', cleanId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                return snapshot.docs[0].ref; // מצאנו! מחזירים את הרפרנס למשתמש הקיים
            }
        } catch (error) {
            console.error(`❌ User Lookup Error (${platform}:${id}):`, error);
        }

        // 3. אם לא מצאנו - ניצור מסמך חדש שה-ID שלו הוא ה-ID של הפלטפורמה
        // (בעתיד יהיה אפשר למזג אותו עם משתמש דיסקורד)
        return db.collection('users').doc(cleanId);
    }

    // Fallback
    return db.collection('users').doc(id);
}

/**
 * שולף את המידע המלא של המשתמש
 */
async function getUserData(id, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return doc.data();
}

/**
 * מוודא שמשתמש קיים ויוצר אותו אם לא (עם מבנה נתונים מלא)
 */
async function ensureUserExists(id, displayName, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    
    await db.runTransaction(async (t) => {
        const doc = await t.get(ref);

        if (!doc.exists) {
            const cleanId = platform === 'whatsapp' ? id.replace('@s.whatsapp.net', '') : id;
            
            const newUser = {
                identity: {
                    displayName: displayName || "Unknown Gamer",
                    joinedAt: new Date().toISOString()
                },
                platforms: {
                    [platform]: cleanId
                },
                economy: { xp: 0, level: 1, balance: 0, mvpWins: 0 },
                stats: { messagesSent: 0, voiceMinutes: 0 },
                brain: { facts: [], roasts: [] },
                meta: { firstSeen: new Date().toISOString(), lastActive: new Date().toISOString() },
                tracking: { status: 'active' }
            };
            t.set(ref, newUser);
        } else {
            // עדכון שם וזמן פעילות אחרון
            t.set(ref, { 
                'identity.displayName': displayName,
                'meta.lastActive': new Date().toISOString()
            }, { merge: true });
        }
    });
}

module.exports = { getUserRef, getUserData, ensureUserExists };
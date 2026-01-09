// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 */
async function getUserRef(id, platform = 'discord') {
    // 1. בדיקה עבור דיסקורד
    if (platform === 'discord') {
        return db.collection('users').doc(id);
    }

    // 2. פלטפורמות אחרות
    const fieldMap = {
        'whatsapp': 'platforms.whatsapp',
        'telegram': 'platforms.telegram'
    };

    const searchField = fieldMap[platform];

    if (searchField) {
        const cleanId = platform === 'whatsapp' 
            ? id.replace('@s.whatsapp.net', '').replace('WA:', '')
            : id.toString();

        try {
            const snapshot = await db.collection('users')
                .where(searchField, '==', cleanId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                return snapshot.docs[0].ref; 
            }
        } catch (error) {
            console.error(`❌ [UserUtils] Lookup Error (${platform}:${id}):`, error);
        }

        return db.collection('users').doc(cleanId);
    }

    return db.collection('users').doc(id);
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

/**
 * ✅ פונקציה קריטית: מוודא שמשתמש קיים ויוצר אותו אם לא.
 */
async function ensureUserExists(id, displayName, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    
    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: משתמש חדש - יצירה נקייה
            if (!doc.exists) {
                console.log(`🆕 [UserUtils] Creating new profile for: ${displayName}`);
                
                const cleanId = platform === 'whatsapp' 
                    ? id.replace('@s.whatsapp.net', '') 
                    : id;
                
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown Gamer",
                        joinedAt: new Date().toISOString()
                    },
                    platforms: {
                        [platform]: cleanId
                    },
                    economy: { 
                        xp: 0, 
                        level: 1, 
                        balance: 0, 
                        mvpWins: 0 
                    },
                    stats: { 
                        messagesSent: 0, 
                        voiceMinutes: 0,
                        casinoWins: 0,
                        casinoLosses: 0
                    },
                    brain: { 
                        facts: [], 
                        roasts: [] 
                    },
                    meta: { 
                        firstSeen: new Date().toISOString(), 
                        lastActive: new Date().toISOString() 
                    },
                    tracking: { status: 'active' }
                };
                
                t.set(ref, newUser);
            } 
            // תרחיש 2: משתמש קיים - עדכון בטוח
            else {
                // ✅ התיקון: שימוש באובייקטים מקוננים במקום מפתחות עם נקודות
                // זה מבטיח שהמבנה יישמר והבאג לא יחזור
                t.set(ref, { 
                    identity: { 
                        displayName: displayName 
                    },
                    meta: { 
                        lastActive: new Date().toISOString() 
                    }
                }, { merge: true });
            }
        });
        
        return ref;

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref;
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
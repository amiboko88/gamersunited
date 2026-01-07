// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 * מחפש ישירות בתוך users לפי שדה הפלטפורמה.
 * * @param {string} id - המזהה (Discord ID, Phone Number, Telegram ID)
 * @param {string} platform - הפלטפורמה ('discord', 'whatsapp', 'telegram')
 */
async function getUserRef(id, platform = 'discord') {
    // 1. בדיקה עבור דיסקורד (מפתח ישיר)
    // בדיסקורד ה-ID של המסמך הוא ה-ID של המשתמש
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
            // חיפוש משתמש קיים שיש לו את ה-ID הזה מקושר בפלטפורמות
            const snapshot = await db.collection('users')
                .where(searchField, '==', cleanId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                // מצאנו! מחזירים את הרפרנס למשתמש הקיים
                return snapshot.docs[0].ref; 
            }
        } catch (error) {
            console.error(`❌ [UserUtils] Lookup Error (${platform}:${id}):`, error);
        }

        // 3. אם לא מצאנו - ניצור רפרנס חדש שה-ID שלו הוא המספר טלפון/מזהה
        // (בעתיד יהיה אפשר למזג אותו עם משתמש דיסקורד אם ירצו)
        return db.collection('users').doc(cleanId);
    }

    // Fallback למקרה חרום
    return db.collection('users').doc(id);
}

/**
 * שולף את המידע המלא של המשתמש.
 * מחזיר null אם המשתמש לא קיים.
 */
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
 * מונע קריסות של "No document to update".
 */
async function ensureUserExists(id, displayName, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    
    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // אם המסמך לא קיים - יוצרים פרופיל חדש מאפס
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
            } else {
                // אם קיים - רק מעדכנים זמן פעילות ושם
                t.set(ref, { 
                    'identity.displayName': displayName,
                    'meta.lastActive': new Date().toISOString()
                }, { merge: true });
            }
        });
        
        return ref; // מחזיר את הרפרנס הבטוח לשימוש

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref; // מחזיר את הרפרנס בכל מקרה כדי לא לתקוע את התהליך
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 * משתמש בשאילתה פנימית במקום ב-lookup חיצוני.
 */
async function getUserRef(id, platform = 'discord') {
    // 1. בדיקה עבור דיסקורד (ID ישיר)
    if (platform === 'discord') {
        return db.collection('users').doc(id);
    }

    // 2. פלטפורמות אחרות (וואטסאפ/טלגרם)
    const fieldMap = {
        'whatsapp': 'platforms.whatsapp',
        'telegram': 'platforms.telegram'
    };

    const searchField = fieldMap[platform];

    if (searchField) {
        // ניקוי יסודי של ה-ID (כולל הסרת + אם קיים)
        const cleanId = platform === 'whatsapp' 
            ? id.replace('@s.whatsapp.net', '').replace('WA:', '').replace('+', '')
            : id.toString();

        try {
            // שאילתה: האם המספר הזה כבר רשום אצל מישהו?
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

        // אם לא מצאנו - מחזירים רפרנס למסמך חדש המבוסס על המספר
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
 * ✅ פונקציה קריטית: מוודא שמשתמש קיים, יוצר אם לא, ומעדכן פרטים חסרים.
 */
async function ensureUserExists(id, displayName, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    
    // הכנה של ה-CleanID לשימוש פנימי
    const cleanId = platform === 'whatsapp' 
        ? id.replace('@s.whatsapp.net', '').replace('WA:', '').replace('+', '')
        : id;

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: משתמש חדש לגמרי - יצירה נקייה
            if (!doc.exists) {
                console.log(`🆕 [UserUtils] Creating new profile for: ${displayName}`);
                
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown Gamer",
                        joinedAt: new Date().toISOString(),
                        // שומרים גם בתוך הזהות לגיבוי
                        [platform === 'whatsapp' ? 'whatsappPhone' : 'telegramId']: cleanId
                    },
                    platforms: {
                        [platform]: cleanId
                    },
                    economy: { 
                        xp: 0, 
                        level: 1, 
                        balance: 0 
                    },
                    stats: { 
                        messagesSent: 0, 
                        voiceMinutes: 0,
                        casinoWins: 0,
                        casinoLosses: 0,
                        mvpWins: 0 // ✅ הועבר ל-stats כדי להתאים למיגרציה
                    },
                    brain: { 
                        facts: [], 
                        roasts: [],
                        sentiment: 0
                    },
                    meta: { 
                        firstSeen: new Date().toISOString(), 
                        lastActive: new Date().toISOString() 
                    },
                    tracking: { status: 'active' }
                };
                
                t.set(ref, newUser);
            } 
            // תרחיש 2: משתמש קיים - עדכון חכם (Self Healing)
            else {
                const data = doc.data();
                
                // אובייקט העדכון
                const updates = {
                    meta: { 
                        ...data.meta, // שומר על שדות קיימים ב-meta
                        lastActive: new Date().toISOString() 
                    }
                };

                // 1. עדכון שם - רק אם השם החדש תקין והישן הוא גנרי/Unknown
                const currentName = data.identity?.displayName;
                if (displayName && displayName !== "Unknown" && displayName !== "Gamer") {
                    if (currentName === "Unknown" || currentName === "Gamer" || !currentName) {
                        updates.identity = {
                            ...data.identity,
                            displayName: displayName
                        };
                    }
                }

                // 2. ✅ התיקון הקריטי: אם חסר לו הפלטפורמה במסמך - נוסיף אותה!
                // זה מטפל במקרים של משתמשים "שבורים" כמו החבר שחזר
                if (!data.platforms || !data.platforms[platform]) {
                    updates.platforms = {
                        ...data.platforms,
                        [platform]: cleanId
                    };
                    // מעדכן גם בזהות אם חסר
                    if (platform === 'whatsapp' && !data.identity?.whatsappPhone) {
                        if (!updates.identity) updates.identity = { ...data.identity };
                        updates.identity.whatsappPhone = cleanId;
                    }
                }

                // ביצוע העדכון עם merge כדי לא לדרוס שדות אחרים
                t.set(ref, updates, { merge: true });
            }
        });
        
        return ref;

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref;
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
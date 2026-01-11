// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * 🛠️ פונקציית העזר הקריטית: מנקה כל סוג של מזהה וואטסאפ (lid, s.whatsapp.net, וכו')
 * מחזירה רק את רצף המספרים הנקי.
 */
function cleanWhatsAppId(id) {
    if (!id) return id;
    // אם זה כבר מספר נקי (רק ספרות), מחזירים אותו
    if (/^\d+$/.test(id)) return id;
    // לוקח רק את מה שלפני ה-@ ומנקה כל תו שאינו ספרה (מסיר +, WA:, רווחים וכו')
    return id.split('@')[0].replace(/\D/g, '');
}

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי.
 * מבצע חיפוש כפול כדי למנוע כפילויות (LID מול JID).
 */
async function getUserRef(id, platform = 'discord') {
    // 1. בדיקה עבור דיסקורד (ID ישיר)
    if (platform === 'discord') {
        return db.collection('users').doc(id);
    }

    // 2. פלטפורמות אחרות (וואטסאפ/טלגרם)
    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id.toString();
    const fieldMap = {
        'whatsapp': 'platforms.whatsapp',
        'telegram': 'platforms.telegram'
    };
    const searchField = fieldMap[platform];

    if (searchField) {
        try {
            // חיפוש 1: האם המספר הנקי הזה כבר רשום כ-ID ראשי בפלטפורמה?
            let snapshot = await db.collection('users')
                .where(searchField, '==', cleanId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                return snapshot.docs[0].ref; 
            }

            // חיפוש 2 (גיבוי לוואטסאפ): האם זה LID והמספר הישן רשום ב-identity?
            if (platform === 'whatsapp') {
                const possibleOldId = cleanId.startsWith('972') ? cleanId : `972${cleanId.replace(/^0+/, '')}`;
                snapshot = await db.collection('users')
                    .where('identity.whatsappPhone', 'in', [cleanId, possibleOldId])
                    .limit(1)
                    .get();
                
                if (!snapshot.empty) {
                    console.log(`🔗 [UserUtils] זיהיתי משתמש לפי מספר ישן: ${cleanId} -> מאחד רשומות.`);
                    return snapshot.docs[0].ref;
                }
            }

        } catch (error) {
            console.error(`❌ [UserUtils] Lookup Error (${platform}:${id}):`, error);
        }

        // אם לא מצאנו - מחזירים רפרנס למסמך חדש המבוסס על המספר הנקי בלבד!
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
    // ניקוי המזהה לפני כל פעולה
    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id;
    
    // קריאה לפונקציה החכמה שתחזיר רפרנס (קיים או חדש)
    const ref = await getUserRef(id, platform);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: משתמש חדש לגמרי - יצירה נקייה
            if (!doc.exists) {
                console.log(`🆕 [UserUtils] Creating new profile for: ${displayName} (${cleanId})`);
                
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown Gamer",
                        joinedAt: new Date().toISOString(),
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
                        mvpWins: 0 
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
                const updates = {};

                // עדכון זמן פעילות בתוך meta
                updates['meta.lastActive'] = new Date().toISOString();

                // 1. עדכון שם - רק אם השם הנוכחי גנרי/חסר
                const currentName = data.identity?.displayName;
                if (displayName && displayName !== "Unknown" && displayName !== "Gamer") {
                    if (currentName === "Unknown" || currentName === "Gamer" || !currentName) {
                        updates['identity.displayName'] = displayName;
                    }
                }

                // 2. עדכון פלטפורמות וטלפון אם חסר (סנכרון זהויות)
                // זה החלק שיחבר את ה-LID החדש לפרופיל הישן לתמיד
                if (!data.platforms || !data.platforms[platform] || data.platforms[platform] !== cleanId) {
                    updates[`platforms.${platform}`] = cleanId;
                    console.log(`🔄 [UserUtils] Linking new ${platform} ID (${cleanId}) to existing user.`);
                }
                
                if (platform === 'whatsapp' && !data.identity?.whatsappPhone) {
                    updates['identity.whatsappPhone'] = cleanId;
                }

                // ביצוע העדכון עם merge רק אם יש שינויים
                if (Object.keys(updates).length > 0) {
                    t.set(ref, updates, { merge: true });
                }
            }
        });
        
        return ref;

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref;
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
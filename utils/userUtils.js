// 📁 utils/userUtils.js
const db = require('./firebase');

function cleanWhatsAppId(id) {
    if (!id) return id;
    if (/^\d+$/.test(id)) return id;
    return id.split('@')[0].replace(/\D/g, '');
}

async function getUserRef(id, platform = 'discord') {
    if (platform === 'discord') return db.collection('users').doc(id);

    // ✅ תמיכה ב-Scout: מתייחסים אליו כוואטסאפ רגיל בחיפוש
    const searchPlatform = (platform === 'whatsapp_scout') ? 'whatsapp' : platform;

    const cleanId = platform === 'whatsapp' || platform === 'whatsapp_scout' ? cleanWhatsAppId(id) : id.toString();
    const isLid = (platform === 'whatsapp' || platform === 'whatsapp_scout') && cleanId.length > 14; 

    // 1. חיפוש ראשי בתיקי האב (users)
    let snapshot = await db.collection('users').where(`platforms.${searchPlatform}`, '==', cleanId).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].ref;

    // 2. חיפוש LID
    if (isLid) {
        snapshot = await db.collection('users').where('platforms.whatsapp_lid', '==', cleanId).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // 3. חיפוש מספר ישן
    if (searchPlatform === 'whatsapp' && !isLid) {
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
    const cleanId = (platform === 'whatsapp' || platform === 'whatsapp_scout') ? cleanWhatsAppId(id) : id;
    const isLid = (platform === 'whatsapp' || platform === 'whatsapp_scout') && cleanId.length > 14; 
    
    // מעבירים את ה-platform המקורי ל-getUserRef כדי שיידע לטפל ב-scout
    const ref = await getUserRef(id, platform);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: המשתמש לא קיים ב-DB
            if (!doc.exists) {
                // 🛑 וואטסאפ רגיל: לא יוצרים (חוסמים ספאם)
                if (platform === 'whatsapp') {
                    console.warn(`🛡️ [UserUtils] משתמש לא מזוהה (${cleanId}). מחזיר NULL לשדכן.`);
                    return; 
                }

                // ✅ אם זה Scout - אנחנו מאשרים יצירה!
                const isScout = (platform === 'whatsapp_scout');
                const realPlatform = isScout ? 'whatsapp' : platform;

                // דיסקורד או Scout: יוצרים פרופיל
                console.log(`🆕 [UserUtils] Creating profile: ${displayName} (${realPlatform})`);
                
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown",
                        joinedAt: new Date().toISOString(),
                        discordId: (platform === 'discord') ? id : null // רק לדיסקורד יש ID וודאי בהתחלה
                    },
                    platforms: { 
                        [realPlatform]: cleanId // שומרים תחת 'whatsapp' ולא 'whatsapp_scout'
                    },
                    economy: { xp: 0, level: 1, balance: 0 },
                    stats: { messagesSent: 0, voiceMinutes: 0 },
                    brain: { facts: [], roasts: [] },
                    meta: { firstSeen: new Date().toISOString(), lastActive: new Date().toISOString() },
                    tracking: { status: isScout ? 'guest' : 'active' } // מסמנים כאורח עד לקישור מלא
                };
                t.set(ref, newUser);
            } 
            // תרחיש 2: משתמש קיים (עדכון)
            else {
                const data = doc.data();
                const updates = { 'meta.lastActive': new Date().toISOString() };
                
                // נרמול שם הפלטפורמה (אם הגענו מ-scout, זה בעצם whatsapp)
                const realPlatform = (platform === 'whatsapp_scout') ? 'whatsapp' : platform;

                // קישור LID אם צריך
                if (isLid) {
                    if (data.platforms?.whatsapp_lid !== cleanId) {
                        updates['platforms.whatsapp_lid'] = cleanId;
                        console.log(`🔗 [UserUtils] קושר LID (${cleanId}) למשתמש קיים.`);
                    }
                } else {
                    if (!data.platforms || !data.platforms[realPlatform]) {
                        updates[`platforms.${realPlatform}`] = cleanId;
                    }
                }
                
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
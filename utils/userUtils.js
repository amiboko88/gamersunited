// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מנקה מזהה וואטסאפ.
 */
function cleanWhatsAppId(id) {
    if (!id) return id;
    if (/^\d+$/.test(id)) return id;
    return id.split('@')[0].replace(/\D/g, '');
}

/**
 * מחזיר רפרנס למסמך.
 * כולל חיפוש חכם ל-LID קיים (אם כבר קישרנו בעבר).
 */
async function getUserRef(id, platform = 'discord') {
    if (platform === 'discord') return db.collection('users').doc(id);

    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id.toString();
    
    // בדיקה האם זה LID (מזהה ארוך של וואטסאפ)
    const isLid = platform === 'whatsapp' && cleanId.length > 14; 

    // 1. חיפוש לפי השדה הישיר (בין אם זה טלפון או LID שכבר שמרנו)
    let snapshot = await db.collection('users').where(`platforms.${platform}`, '==', cleanId).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].ref;

    // 2. אם זה LID, ננסה לחפש אם שמרנו אותו בשדה מיוחד 'platforms.whatsapp_lid'
    if (isLid) {
        snapshot = await db.collection('users').where('platforms.whatsapp_lid', '==', cleanId).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // 3. אם זה טלפון רגיל, ננסה לחפש במספר הישן
    if (platform === 'whatsapp' && !isLid) {
        const possibleOldId = cleanId.startsWith('972') ? cleanId : `972${cleanId.replace(/^0+/, '')}`;
        snapshot = await db.collection('users').where('identity.whatsappPhone', 'in', [cleanId, possibleOldId]).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // אם לא מצאנו - מחזירים כתובת למסמך חדש
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

/**
 * ✅ הפונקציה הקריטית: יוצרת או מעדכנת משתמש.
 * כוללת הגנה מפני יצירת "זבל" (LID ללא קישור).
 */
async function ensureUserExists(id, displayName, platform = 'discord') {
    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id;
    const isLid = platform === 'whatsapp' && cleanId.length > 14; 

    const ref = await getUserRef(id, platform);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // תרחיש 1: משתמש חדש
            if (!doc.exists) {
                // 🛑 חסימה קריטית: אם זה LID/וואטסאפ לא מזוהה - לא יוצרים!
                // בגרסה שלך החלטנו שאם זה LID לא יוצרים, וגם אם זה וואטסאפ בכלל לא יוצרים כדי שהשדכן יעבוד
                if (platform === 'whatsapp') {
                    console.warn(`🛡️ [UserUtils] נמנעה יצירת פרופיל זבל ל: ${cleanId} (${displayName})`);
                    return; 
                }

                console.log(`🆕 [UserUtils] Creating new profile for: ${displayName} (${cleanId})`);
                
                const newUser = {
                    identity: {
                        displayName: displayName || "Unknown Gamer",
                        joinedAt: new Date().toISOString(),
                        [platform === 'whatsapp' ? 'whatsappPhone' : 'telegramId']: cleanId
                    },
                    platforms: { [platform]: cleanId },
                    economy: { xp: 0, level: 1, balance: 0 },
                    stats: { messagesSent: 0, voiceMinutes: 0, casinoWins: 0, casinoLosses: 0, mvpWins: 0 },
                    brain: { facts: [], roasts: [], sentiment: 0 },
                    meta: { firstSeen: new Date().toISOString(), lastActive: new Date().toISOString() },
                    tracking: { status: 'active' }
                };
                t.set(ref, newUser);
            } 
            // תרחיש 2: משתמש קיים
            else {
                const data = doc.data();
                const updates = { 'meta.lastActive': new Date().toISOString() };

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

                if (displayName && displayName !== "Unknown" && displayName !== "WhatsApp User" && 
                   (!data.identity?.displayName || data.identity.displayName === "Unknown")) {
                    updates['identity.displayName'] = displayName;
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
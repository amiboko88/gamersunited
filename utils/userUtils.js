// 📁 utils/userUtils.js
const db = require('./firebase');

function cleanWhatsAppId(id) {
    if (!id) return id;
    if (/^\d+$/.test(id)) return id;
    return id.split('@')[0].replace(/\D/g, '');
}

async function getUserRef(id, platform = 'discord') {
    if (platform === 'discord') return db.collection('users').doc(id);

    const cleanId = cleanWhatsAppId(id);
    const isLid = cleanId.length > 14;

    // 1. חיפוש ראשי בתיקי האב (users)
    // בודקים אם המספר/LID קיים בשדה הפלטפורמה
    // תמיכה ב-Telegram ID:
    let searchField = `platforms.${platform}`;
    if (platform === 'telegram') searchField = 'platforms.telegram';

    let snapshot = await db.collection('users').where(searchField, '==', cleanId).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].ref;

    // 2. חיפוש LID ספציפי (למקרה שהוא נשמר רק ב-LID ולא בראשי)
    if (isLid) {
        snapshot = await db.collection('users').where('platforms.whatsapp_lid', '==', cleanId).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;
    }

    // 3. חיפוש מספר טלפון (תמיכה בפורמטים שונים)
    if (!isLid) {
        // מנרמל את ה-ID הנכנס (שהוא בדרך כלל בפורמט בינלאומי מוואטסאפ: 97250...)
        const international = cleanId.startsWith('972') ? cleanId : `972${cleanId.replace(/^0+/, '')}`;

        // מייצר גרסה מקומית (050...) למקרה שהמשתמש הזין כך ב-DB
        const local = international.replace(/^972/, '0');

        // חיפוש גמיש בשדה הזהות (legacy field)
        snapshot = await db.collection('users').where('identity.whatsappPhone', 'in', [international, local, cleanId]).limit(1).get();
        if (!snapshot.empty) return snapshot.docs[0].ref;

        // 4. חיפוש גמיש בשדה הפלטפורמה (למקרה שנשמר כמספר מקומי ב-platforms)
        if (platform === 'whatsapp') {
            snapshot = await db.collection('users').where('platforms.whatsapp', 'in', [international, local]).limit(1).get();
            if (!snapshot.empty) return snapshot.docs[0].ref;
        }
    }

    // אם לא מצאנו - מחזירים רפרנס למסמך (אבל לא יוצרים אותו!)
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
    // אם זה וואטסאפ, אנחנו מנקים את ה-ID
    const cleanId = platform === 'whatsapp' ? cleanWhatsAppId(id) : id;
    const isLid = platform === 'whatsapp' && cleanId.length > 14;

    const ref = await getUserRef(id, platform);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);

            // --- תרחיש 1: המשתמש לא קיים ב-DB ---
            if (!doc.exists) {
                // 🛑 חסימה מוחלטת למזהים קצרים/שגויים (Hardening)
                if (id.length < 16) {
                    console.log(`🛡️ [UserUtils] Blocked creation of invalid ID: ${id}`);
                    return null;
                }

                // 🛑 חסימה מוחלטת ל-LID (משתמשים זמניים של וואטסאפ)
                // אנחנו לא רוצים ליצור מסמך למשתמש שאין לו עדיין "אבא" (דיסקורד).
                if (platform === 'whatsapp' && isLid) {
                    console.log(`🛡️ [UserUtils] LID Guard Blocked: ${cleanId}. Waiting for Link.`);
                    return null;
                }

                // 🛑 חסימה מוחלטת לוואטסאפ/טלגרם (Link Only)
                // אנחנו לא רוצים ליצור משתמשי טלגרם רמה 1 במקביל לדיסקורד רמה 3.
                // אם המשתמש לא קיים ב-DB, ואנחנו בטלגרם - לא יוצרים כלום.
                if (platform === 'whatsapp' || platform === 'telegram') {
                    // console.warn(`🛡️ [UserUtils] משתמש ${platform} לא מקושר (${cleanId}). מדלג.`);
                    return null; // מחזיר null כדי שהבוט ידע שאין משתמש
                }

                // אם זה דיסקורד - יוצרים כרגיל (כי דיסקורד הוא הבסיס)
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

            // --- תרחיש 2: משתמש קיים (עדכון בלבד) ---
            else {
                const data = doc.data();
                const updates = { 'meta.lastActive': new Date().toISOString() };

                // ריפוי עצמי: אם למשתמש יש כבר פרופיל, אבל ה-LID לא מעודכן - נעדכן אותו
                // זה קורה כשאתה מקשר מספר טלפון, ואז הודעה מגיעה עם LID
                if (platform === 'whatsapp' && isLid) {
                    if (data.platforms?.whatsapp_lid !== cleanId) {
                        updates['platforms.whatsapp_lid'] = cleanId;
                        console.log(`🔗 [UserUtils] עדכון LID (${cleanId}) למשתמש קיים.`);
                    }
                }

                t.update(ref, updates);
            }
        });

        return ref;

    } catch (error) {
        console.error(`❌ [UserUtils] Transaction Error:`, error);
        return ref;
    }
}

module.exports = { getUserRef, getUserData, ensureUserExists };
const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');

/**
 * ✅ סנכרון שמות Unknown מהשרת ל-DB
 */
async function syncUnknownUsers(guild) {
    if (!guild) return { success: false, message: 'Guild not found' };

    log('🔍 [Sync] מתחיל סנכרון שמות Unknown...');
    const snapshot = await db.collection('users').get();
    let updateCount = 0;

    for (const doc of snapshot.docs) {
        const userId = doc.id;
        const data = doc.data();

        // בודקים אם זה מזהה דיסקורד (ספרות) והשם הוא Unknown
        const isDiscordId = /^\d+$/.test(userId) && userId.length > 15;
        const isUnknown = !data.identity?.displayName || data.identity.displayName === "Unknown";

        if (isDiscordId && isUnknown) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    const bestName = member.nickname || member.user.displayName || member.user.username;
                    if (bestName && bestName !== "Unknown") {
                        await db.collection('users').doc(userId).set({
                            identity: { displayName: bestName }
                        }, { merge: true });
                        updateCount++;
                    }
                }
            } catch (e) { continue; }
        }
    }
    return { success: true, count: updateCount };
}

/**
 * ✅ סנכרון משתמשים חסרים (הוספת משתמשים שלא קיימים ב-DB)
 * כולל Self Healing לווריפיקציה והגנות הקשחה.
 */
async function syncMissingUsers(guild) {
    if (!guild) return { success: false, count: 0 };
    log('🔍 [Sync] מתחיל סנכרון משתמשים חסרים...');

    // 1. קבלת כל המשתמשים בשרת
    await guild.members.fetch();
    const allMembers = guild.members.cache;

    // 2. קבלת כל ה-IDs הקיימים ב-DB
    const snapshot = await db.collection('users').select('identity').get();
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));

    let addedCount = 0;
    const batch = db.batch();
    let batchOpCount = 0;

    for (const [id, member] of allMembers) {
        if (member.user.bot) continue; // 🛡️ הגנה: בוטים
        if (id.length < 16) continue;   // 🛡️ הגנה: מזהים שגויים (מינימום 16 ספרות)

        // --- ריפוי עצמי (Self Healing) ---
        // אם המשתמש קיים ב-DB, נבדוק אם יש לו רול Verified ונעדכן אם צריך
        if (existingIds.has(id)) {

            // לוגיקה לזיהוי רול
            const hasVerifiedRole = member.roles.cache.some(r =>
                r.id === process.env.VERIFIED_ROLE_ID ||
                r.name.toLowerCase() === 'verified' ||
                r.name.includes('מאומת') ||
                r.name === 'Member' // ברירת מחדל בשרתים מסוימים
            );

            if (hasVerifiedRole) {
                // בדיקה האם כבר מסומן כמאומת (כדי לחסוך כתיבות)
                // ביצוע כתיבה אופטימית (Merge זול).
                batch.set(db.collection('users').doc(id), {
                    meta: { isVerified: true, lastSeen: new Date().toISOString() },
                    tracking: { status: 'active' }
                }, { merge: true });
                batchOpCount++;
            }
            continue;
        }

        // המשתמש חסר ב-DB - יצירה
        const ref = db.collection('users').doc(id);
        const userData = {
            identity: {
                displayName: member.displayName,
                username: member.user.username,
                joinedAt: member.joinedAt.toISOString(),
                avatar: member.user.displayAvatarURL()
            },
            economy: { xp: 0, balance: 0, level: 1 },
            meta: { firstSeen: new Date().toISOString() }
        };

        batch.set(ref, userData, { merge: true });
        addedCount++;
        batchOpCount++;

        if (batchOpCount >= 400) {
            await batch.commit();
            batchOpCount = 0;
        }
    }

    if (batchOpCount > 0) await batch.commit();

    log(`✅ [Sync] נוספו ${addedCount} משתמשים חסרים/עודכנו.`);
    return { success: true, count: addedCount };
}

module.exports = { syncUnknownUsers, syncMissingUsers };

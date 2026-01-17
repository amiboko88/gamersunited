const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');

/**
 * ✅ מחזיר רשימה של משתמשי רפאים עם הגנות בטיחות
 */
async function getGhostUsers(guild) {
    if (!guild) return [];

    const snapshot = await db.collection('users').get();
    const ghosts = [];
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // רשימת חסינות (בוטים ומערכת)
    const IMMUNE_IDS = ['1302302783856377856', '1246868043196534806', '981628639237697586'];

    for (const doc of snapshot.docs) {
        const userId = doc.id;
        const data = doc.data();

        // 1. סינון בסיסי: האם זה ID תקין?
        const isDiscordId = /^\d+$/.test(userId) && userId.length > 15;
        if (!isDiscordId) continue;

        // 2. חסינות: בוטים ומנהלים
        if (IMMUNE_IDS.includes(userId)) continue;

        // 3. הגנה על משתמשים חדשים (Grace Period)
        const lastActive = data.meta?.lastActive ? new Date(data.meta.lastActive).getTime() : 0;
        const created = data.identity?.joinedAt ? new Date(data.identity.joinedAt).getTime() : 0;

        if ((now - lastActive < ONE_DAY) || (now - created < ONE_DAY)) continue;

        // 4. בדיקה עמוקה מול ה-API של דיסקורד (LIVE CHECK)
        try {
            const member = await guild.members.fetch(userId);
            if (member) continue; // קיים בשרת
        } catch (e) {
            if (e.code !== 10007) continue; // שגיאה שאינה 404
        }

        // המשתמש באמת איננו
        const hasValue = (data.economy?.balance > 0) || (data.economy?.xp > 50);

        ghosts.push({
            id: userId,
            name: data.identity?.displayName || 'Unknown',
            xp: data.economy?.xp || 0,
            joined: data.identity?.joinedAt ? new Date(data.identity.joinedAt).toLocaleDateString() : '?',
            hasValue
        });
    }
    return ghosts;
}

async function cleanBots(guild) {
    const BOT_IDS = ['1302302783856377856', '1246868043196534806'];
    let deletedCount = 0;
    const snapshot = await db.collection('users').get();
    const batch = db.batch();
    let batchOpCount = 0;

    for (const doc of snapshot.docs) {
        const userId = doc.id;
        let isBot = false;

        if (BOT_IDS.includes(userId)) isBot = true;
        if (userId.length < 16) isBot = true;

        if (!isBot && guild) {
            // אם אנחנו לא בטוחים נבדוק מול השרת
            try {
                const member = await guild.members.fetch(userId);
                if (member.user.bot) isBot = true;
            } catch (e) { }
        }

        if (isBot) {
            batch.delete(doc.ref);
            deletedCount++;
            batchOpCount++;
        }

        if (batchOpCount >= 400) {
            await batch.commit();
            batchOpCount = 0;
        }
    }

    if (batchOpCount > 0) await batch.commit();
    return deletedCount;
}

async function purgeUsers(userIds) {
    let count = 0;
    const batchSize = 500;

    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = db.batch();
        const chunk = userIds.slice(i, i + batchSize);

        chunk.forEach(id => {
            const ref = db.collection('users').doc(id);
            batch.delete(ref);
        });

        await batch.commit();
        count += chunk.length;
    }
    return count;
}

async function executeKickBatch(guild, userIds) {
    let kicked = [], failed = [];
    for (const userId of userIds) {
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                await member.kick('Shimon: Inactive > 180 Days');
                kicked.push(member.displayName);
                await db.collection('users').doc(userId).set({ tracking: { status: 'kicked', kickedAt: new Date().toISOString() } }, { merge: true });
            }
        } catch (e) { failed.push(userId); }
    }
    return { kicked, failed };
}

module.exports = { getGhostUsers, cleanBots, purgeUsers, executeKickBatch };

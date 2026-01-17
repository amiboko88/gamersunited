// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

const DAYS = {
    DEAD: 180,    // 6 חודשים - לקיק
    SUSPECT: 90,  // 3 חודשים - לבדיקה
    AFK: 30       // חודש
};

const IMMUNE_ROLES_NAMES = ['MVP', 'Server Booster', 'VIP'];

class UserManager {

    // כתיבה למבנה הנקי בלבד
    async updateLastActive(userId) {
        try {
            const now = new Date().toISOString();
            await db.collection('users').doc(userId).set({
                meta: { lastActive: now, lastSeen: now },
                tracking: { statusStage: 'active' }
            }, { merge: true });
        } catch (e) { }
    }

    /**
     * ✅ פונקציה 1: סנכרון שמות Unknown מהשרת ל-DB
     */
    async syncUnknownUsers(guild) {
        if (!guild) return { success: false, message: 'Guild not found' };

        log('🔍 [UserManager] מתחיל סנכרון שמות Unknown...');
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
     * ✅ פונקציה חדשה: סנכרון משתמשים חסרים (הוספת משתמשים שלא קיימים ב-DB)
     */
    async syncMissingUsers(guild) {
        if (!guild) return { success: false, count: 0 };
        log('🔍 [UserManager] מתחיל סנכרון משתמשים חסרים...');

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
            if (member.user.bot) continue;
            if (existingIds.has(id)) continue;

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

        log(`✅ [UserManager] נוספו ${addedCount} משתמשים חסרים.`);
        return { success: true, count: addedCount };
    }

    /**
     * ✅ מחזיר רשימה של משתמשי רפאים (קיימים ב-DB, לא בשרת) לבדיקה לפני מחיקה
     */
    async getGhostUsers(guild) {
        if (!guild) return [];

        const snapshot = await db.collection('users').get();
        const ghosts = [];

        for (const doc of snapshot.docs) {
            const userId = doc.id;
            const data = doc.data();

            // סינון 1: האם זה ID של דיסקורד?
            const isDiscordId = /^\d+$/.test(userId) && userId.length > 15;
            if (!isDiscordId) continue;

            // סינון 2: האם הוא בשרת?
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                // המשתמש לא בשרת. האם יש לו ערך?
                const hasValue = (data.economy?.balance > 0) || (data.economy?.xp > 50);

                ghosts.push({
                    id: userId,
                    name: data.identity?.displayName || 'Unknown',
                    xp: data.economy?.xp || 0,
                    joined: data.identity?.joinedAt ? new Date(data.identity.joinedAt).toLocaleDateString() : '?',
                    hasValue // דגל לסימון משתמשים שאולי שווה לשמור
                });
            }
        }
        return ghosts;
    }

    /**
     * ✅ מחיקת משתמשים לפי רשימת IDs
     */
    async purgeUsers(userIds) {
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

    async getInactivityStats(guild) {
        if (!guild) return null;
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;
        const stats = {
            total: 0, humans: 0, active: 0, immune: 0,
            dead: [], review: [], sleeping: [], afk: [],
            kickCandidates: [], newMembers: 0, voiceNow: 0
        };

        try {
            if (guild.memberCount !== guild.members.cache.size) {
                try { await guild.members.fetch({ time: 8000 }); } catch (e) { }
            }
            const allMembers = guild.members.cache;
            stats.total = guild.memberCount;

            const [usersSnapshot, gameStatsSnapshot] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get()
            ]);

            const usersMap = new Map();
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));
            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            allMembers.forEach(member => {
                if (member.user.bot) return;
                stats.humans++;
                const userId = member.id;
                const userData = usersMap.get(userId) || {};
                const userGames = gamesMap.get(userId) || {};

                const isOnline = member.presence && member.presence.status !== 'offline';
                const isInVoice = member.voice && member.voice.channelId;
                if (isInVoice) stats.voiceNow++;

                let daysInactive = 0;
                if (isOnline || isInVoice) {
                    daysInactive = 0;
                } else {
                    const lastSeenTime = this.calculateLastSeen(member, userData, userGames);
                    daysInactive = Math.floor((now - lastSeenTime) / msPerDay);
                }

                const daysSinceJoin = Math.floor((now - member.joinedTimestamp) / msPerDay);
                const hasLegacy = (userData.economy?.xp > 100) || (userData.stats?.messagesSent > 10);
                const isImmune = member.roles.cache.some(r =>
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) { stats.immune++; return; }

                if (daysInactive < DAYS.AFK) {
                    if (daysSinceJoin < 7) stats.newMembers++;
                    stats.active++;
                } else if (daysInactive >= DAYS.DEAD) {
                    stats.dead.push({ userId, days: daysInactive, name: member.displayName });
                    stats.kickCandidates.push({ userId, days: daysInactive, name: member.displayName });
                } else if (daysInactive >= DAYS.SUSPECT) {
                    if (hasLegacy) stats.review.push({ userId, days: daysInactive, name: member.displayName });
                    else stats.sleeping.push({ userId, days: daysInactive, name: member.displayName });
                } else {
                    if (daysSinceJoin < 60) stats.afk.push({ userId, days: daysInactive, name: member.displayName });
                    else stats.active++;
                }
            });
            return stats;
        } catch (error) { return null; }
    }

    calculateLastSeen(member, userData, userGames) {
        let timestamps = [];
        if (userData.meta) {
            if (userData.meta.lastSeen) timestamps.push(new Date(userData.meta.lastSeen).getTime());
            if (userData.meta.lastActive) timestamps.push(new Date(userData.meta.lastActive).getTime());
            if (userData.meta.firstSeen) timestamps.push(new Date(userData.meta.firstSeen).getTime());
        }
        if (userData.tracking?.joinedAt) timestamps.push(new Date(userData.tracking.joinedAt).getTime());
        if (userData.identity?.lastWhatsappMessage) timestamps.push(new Date(userData.identity.lastWhatsappMessage).getTime());

        if (userGames) {
            Object.values(userGames).forEach(game => {
                if (game.lastPlayed) timestamps.push(new Date(game.lastPlayed).getTime());
            });
        }
        timestamps.push(member.joinedTimestamp);
        return Math.max(...timestamps);
    }

    async executeKickBatch(guild, userIds) {
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
}

module.exports = new UserManager();
const db = require('../../../utils/firebase');
const admin = require('firebase-admin'); // ✅ Top-Level Import

const DAYS = {
    DEAD: 180,
    SUSPECT: 90,
    AFK: 30
};
const IMMUNE_ROLES_NAMES = ['MVP', 'Server Booster', 'VIP'];

function calculateLastSeen(member, userData, userGames) {
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

async function getInactivityStats(guild) {
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
                const lastSeenTime = calculateLastSeen(member, userData, userGames);
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

async function addVoiceMinutes(userId, minutes) {
    if (!userId || !minutes) return;
    try {
        // const admin = require('firebase-admin'); // Moved to top
        await db.collection('users').doc(userId).set({
            stats: {
                voiceMinutes: admin.firestore.FieldValue.increment(minutes)
            },
            meta: { lastActive: new Date().toISOString() }
        }, { merge: true });
        // log(`⏱️ [Stats] Updated ${minutes} voice minutes for ${userId}`);
    } catch (e) {
        console.error(`Failed to update voice stats: ${e.message}`);
    }
}

module.exports = { getInactivityStats, calculateLastSeen, addVoiceMinutes };

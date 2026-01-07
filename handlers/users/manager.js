// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

class UserManager {
    async updateLastActive(userId) {
        try {
            await db.collection('users').doc(userId).set({
                meta: { lastActive: new Date().toISOString() },
                tracking: { statusStage: 'active' }
            }, { merge: true });
        } catch (error) {
            log(`❌ [UserManager] עדכון פעילות נכשל: ${error.message}`);
        }
    }

    async getInactivityStats(guild) {
        if (!guild) return null;
        const snapshot = await db.collection('users').get();
        const now = Date.now();
        
        const stats = {
            total: 0, active: 0,
            inactive7: [], inactive14: [], inactive30: [],
            failedDM: [], kickCandidates: []
        };
        const membersCache = guild.members.cache;

        snapshot.forEach(doc => {
            const data = doc.data();
            const userId = doc.id;
            if (!membersCache.has(userId) || membersCache.get(userId).user.bot) return;

            stats.total++;
            const lastActiveStr = data.meta?.lastActive || data.tracking?.joinedAt;
            let daysInactive = 0;
            if (lastActiveStr) {
                daysInactive = Math.floor((now - new Date(lastActiveStr).getTime()) / (1000 * 60 * 60 * 24));
            }
            const stage = data.tracking?.statusStage || 'active';

            if (stage === 'failed_dm') {
                stats.failedDM.push(userId);
                stats.kickCandidates.push(userId);
            } else if (daysInactive >= 30) {
                stats.inactive30.push({ userId, days: daysInactive });
                stats.kickCandidates.push(userId);
            } else if (daysInactive >= 14) {
                stats.inactive14.push({ userId, days: daysInactive });
            } else if (daysInactive >= 7) {
                stats.inactive7.push({ userId, days: daysInactive });
            } else {
                stats.active++;
            }
        });
        return stats;
    }

    async kickUsers(guild, userIds) {
        let kicked = [], failed = [];
        for (const userId of userIds) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.kick('Inactivity Cleanup');
                    kicked.push(userId);
                    await db.collection('users').doc(userId).update({ 'tracking.status': 'kicked' });
                } else {
                    await db.collection('users').doc(userId).update({ 'tracking.status': 'left' });
                }
            } catch (e) { failed.push(userId); }
        }
        return { kicked, failed };
    }
}
module.exports = new UserManager();
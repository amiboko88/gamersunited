// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// 📦 ייבוא המודולים המפוצלים (Core Modules)
const syncModule = require('./core/sync');
const cleanupModule = require('./core/cleanup');
const restoreModule = require('./core/restore');
const statsModule = require('./core/stats');

class UserManager {

    // --- Core Properties ---

    // כתיבה למבנה הנקי בלבד (קצרה מדי מכדי לפצל)
    async updateLastActive(userId) {
        if (!userId || userId.length < 16) {
            // 🚨 Alert Admin about this attempt
            try {
                const { getSocket } = require('../../whatsapp/socket');
                const sock = getSocket();
                if (sock) {
                    const blockMsg = `🛡️ **Security Alert: Illegal DB Write Blocked**\n` +
                        `⚠️ **Target ID:** \`${userId}\`\n` +
                        `🕒 **Time:** ${new Date().toLocaleString('he-IL')}\n` +
                        `🛑 **Action:** Write prevented. Check logs for origin.`;
                    await sock.sendMessage('972526800647@s.whatsapp.net', { text: blockMsg });
                }
            } catch (e) { console.error('Failed to send admin alert:', e); }

            log(`🛑 [UserManager] Blocked write for invalid ID: ${userId}`);
            return;
        }

        try {
            const now = new Date().toISOString();
            await db.collection('users').doc(userId).set({
                meta: { lastActive: now, lastSeen: now },
                tracking: { statusStage: 'active' }
            }, { merge: true });
        } catch (e) { }
    }

    // --- Sync Methods ---

    async syncUnknownUsers(guild) {
        return syncModule.syncUnknownUsers(guild);
    }

    async syncMissingUsers(guild) {
        return syncModule.syncMissingUsers(guild);
    }

    // --- Cleanup & Restoration Methods ---

    async getGhostUsers(guild) {
        return cleanupModule.getGhostUsers(guild);
    }

    async cleanBots(guild) {
        return cleanupModule.cleanBots(guild);
    }

    async purgeUsers(userIds) {
        return cleanupModule.purgeUsers(userIds);
    }

    async restoreFromBackup() {
        return restoreModule.restoreFromBackup();
    }

    async executeKickBatch(guild, userIds) {
        return cleanupModule.executeKickBatch(guild, userIds);
    }

    // --- Stats Methods ---

    async getInactivityStats(guild) {
        return statsModule.getInactivityStats(guild);
    }

    // Helper exposed if needed (though mostly internal to stats)
    calculateLastSeen(member, userData, userGames) {
        return statsModule.calculateLastSeen(member, userData, userGames);
    }
}

module.exports = new UserManager();
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

    // 🆕 Universal Username Sync (Replaces local script)
    async syncUsernames(guild) {
        log('🔄 [UserManager] Starting Global Username Sync...');
        const snapshot = await db.collection('users').get();
        let updatedCount = 0;
        let batch = db.batch();
        let batchCount = 0;

        // Pre-fetch all members to map (faster than one-by-one)
        const members = await guild.members.fetch();
        log(`👥 Fetched ${members.size} members from Discord.`);

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const discordId = data.identity?.discordId || doc.id;

            // Try to find member in guild cache
            const member = members.get(discordId);

            let needsUpdate = false;
            let updatePayload = {};

            if (member) {
                const realUsername = member.user.username; // The universal Handle
                const currentUsername = data.identity?.username;

                // Update Username if changed/missing
                if (currentUsername !== realUsername) {
                    updatePayload['identity.username'] = realUsername;
                    // Also refresh avatar while we are at it
                    updatePayload['identity.avatar'] = member.user.displayAvatarURL({ extension: 'png' });
                    needsUpdate = true;
                }
            }

            // Cleanup Legacy 'fullName'
            if (data.identity?.fullName !== undefined) {
                updatePayload['identity.fullName'] = admin.firestore.FieldValue.delete();
                needsUpdate = true;
            }

            if (needsUpdate) {
                const docRef = db.collection('users').doc(doc.id);
                // Use update to be safe (requires existence, which we know)
                batch.update(docRef, updatePayload);
                batchCount++;
                updatedCount++;
            }

            if (batchCount >= 400) {
                await batch.commit();
                batchCount = 0;
                batch = db.batch(); // Re-init
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        log(`✅ [UserManager] Username Sync Complete. Updated ${updatedCount} users.`);
        return { count: updatedCount };
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

    // ✅ שוחזר: עדכון דקות שיחה (Critical for Leaderboard)
    async addVoiceMinutes(userId, minutes) {
        return statsModule.addVoiceMinutes(userId, minutes);
    }
}

module.exports = new UserManager();
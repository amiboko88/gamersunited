const db = require('../../../utils/firebase');
const userManager = require('../../users/manager');
const matchmaker = require('../../matchmaker');
const { log } = require('../../../utils/logger');
const scanner = require('../../../telegram/utils/scanner');

class DashboardLogic {

    async getMainStats(guild) {
        const stats = await userManager.getInactivityStats(guild);
        const orphans = await matchmaker.getOrphans();

        // Ghost Count (Live Query)
        const ghostSnapshot = await db.collection('users').where('identity.displayName', '==', 'Unknown').get();
        const ghostCount = ghostSnapshot.size;

        // Telegram Orphans
        const tgOrphanRef = db.collection('system_metadata').doc('telegram_orphans');
        const tgOrphanDoc = await tgOrphanRef.get();
        const tgOrphans = tgOrphanDoc.exists ? Object.values(tgOrphanDoc.data().list || {}) : [];
        const tgMatchCount = tgOrphans.length;

        return { stats, orphans, ghostCount, tgMatchCount, tgOrphans };
    }

    async getDebugStats(guild) {
        const usersCount = (await db.collection('users').count().get()).data().count;
        const orphansCount = (await db.collection('orphans').count().get()).data().count;
        const activeSessions = guild.voiceStates.cache.size;
        return { usersCount, orphansCount, activeSessions };
    }

    async getGhostUsers(guild) {
        return await userManager.getGhostUsers(guild);
    }

    async executeGhostPurge(ids) {
        return await userManager.purgeUsers(ids);
    }

    async getKickCandidates(guild) {
        const stats = await userManager.getInactivityStats(guild);
        return stats.kickCandidates;
    }

    async executeKickBatch(guild, userIds) {
        return await userManager.executeKickBatch(guild, userIds);
    }

    // --- Telegram Logic ---

    async getTelegramUnlinkedUsers() {
        const doc = await db.collection('system_metadata').doc('telegram_unlinked_users').get();
        return doc.exists ? Object.values(doc.data().list || {}) : [];
    }

    async executeTelegramForceScan(setStatusCallback) {
        const doc = await db.collection('system_metadata').doc('telegram_unlinked_users').get();
        if (!doc.exists) return 0;

        const users = Object.values(doc.data().list || {});
        setStatusCallback(`🕵️ סורק ${users.length} משתמשים...`);

        for (const user of users) {
            const mockTgUser = {
                id: user.tgId,
                username: user.username,
                first_name: user.displayName.split(' ')[0],
                last_name: user.displayName.split(' ').slice(1).join(' ')
            };
            await scanner.scanUser(mockTgUser);
        }

        // Return updated count
        const orphansDoc = await db.collection('system_metadata').doc('telegram_orphans').get();
        const orphans = orphansDoc.exists ? Object.values(orphansDoc.data().list || {}) : [];
        return orphans.length;
    }

    async executeTelegramLink(tgId, discordId) {
        // 1. Update User in DB
        await db.collection('users').doc(discordId).update({
            'platforms.telegram': tgId,
            'identity.telegramId': tgId,
            'meta.lastLinked': new Date().toISOString()
        });

        // 2. Remove from lists
        const orphanRef = db.collection('system_metadata').doc('telegram_orphans');
        const unlinkedRef = db.collection('system_metadata').doc('telegram_unlinked_users');

        await db.runTransaction(async t => {
            const orphanDoc = await t.get(orphanRef);
            const orphanData = orphanDoc.data();
            if (orphanData?.list && orphanData.list[tgId]) {
                delete orphanData.list[tgId];
                t.set(orphanRef, orphanData);
            }

            const unlinkedDoc = await t.get(unlinkedRef);
            const unlinkedData = unlinkedDoc.data();
            if (unlinkedData?.list && unlinkedData.list[tgId]) {
                delete unlinkedData.list[tgId];
                t.set(unlinkedRef, unlinkedData);
            }
        });

        log(`🔗 [Telegram] חובר בהצלחה: ${discordId} <-> ${tgId}`);
        return true;
    }

    async rejectTelegramMatch(tgId) {
        const orphanRef = db.collection('system_metadata').doc('telegram_orphans');
        await db.runTransaction(async t => {
            const doc = await t.get(orphanRef);
            const data = doc.data();
            if (data.list && data.list[tgId]) {
                delete data.list[tgId];
                t.set(orphanRef, data);
            }
        });
        return true;
    }

    // --- WhatsApp Logic ---
    async finalizeWhatsAppLink(discordId, phone) {
        await db.collection('users').doc(discordId).update({
            'platforms.whatsapp_lid': phone,
            'identity.whatsappPhone': phone,
            'meta.lastLinked': new Date().toISOString()
        });
        return true;
    }
}

module.exports = new DashboardLogic();

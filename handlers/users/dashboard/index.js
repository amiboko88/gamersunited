const logic = require('./logic');
const ui = require('./ui');
const platformManager = require('../platformManager');
const { log } = require('../../../utils/logger');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js'); // Some basics still needed for small interactions

class DashboardHandler {

    async showMainDashboard(interaction, isUpdate = true) {
        try {
            const { stats, orphans, ghostCount, tgMatchCount, tgOrphans } = await logic.getMainStats(interaction.guild);

            if (!stats) return this.safeReply(interaction, '❌ נתונים בטעינה... נסה שוב.', true);

            const payload = await ui.renderMainDashboard(stats, ghostCount, orphans.length, tgMatchCount);

            if (isUpdate && (interaction.message || interaction.deferred)) {
                await interaction.editReply(payload);
            } else {
                await interaction.reply({ ...payload, flags: 64 });
            }
        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            this.safeReply(interaction, '❌ System Error.', true);
        }
    }

    async showDebugPanel(interaction) {
        await interaction.deferUpdate();
        const { usersCount, orphansCount, activeSessions } = await logic.getDebugStats(interaction.guild);
        const payload = ui.renderDebugPanel(usersCount, activeSessions, orphansCount);
        await interaction.editReply(payload);
    }

    async showLinkPanel(interaction) {
        await interaction.deferUpdate();
        const { orphans } = await logic.getMainStats(interaction.guild);

        if (orphans.length === 0) {
            await interaction.followUp({ content: '✅ **אין משתמשי WhatsApp הממתינים לחיבור.**\nכולם כבר מקושרים או שאין הודעות חדשות.', ephemeral: true });
            return platformManager.showWhatsAppDashboard(interaction);
        }

        const payload = ui.renderLinkPanel(orphans);
        await interaction.editReply(payload);
    }

    async handleLinkSelection(interaction) {
        if (!interaction.values || interaction.values.length === 0) return;
        const phone = interaction.values[0];
        const payload = ui.renderUserSelection(phone);
        await interaction.reply(payload);
    }

    async finalizeLink(interaction) {
        const phone = interaction.customId.split('_').pop();
        const discordId = interaction.values[0];

        await interaction.deferUpdate();
        try {
            await logic.finalizeWhatsAppLink(discordId, phone);
            await interaction.editReply({ content: `✅ **חובר!**\nLID: ${phone}\nDiscord: <@${discordId}>`, components: [] });
            await platformManager.showWhatsAppDashboard(interaction, false);
        } catch (e) {
            log(`Link Error: ${e.message}`);
            await interaction.editReply({ content: '❌ שגיאה בחיבור.', components: [] });
        }
    }

    // --- Ghost Purge ---

    async showGhostPurgeList(interaction) {
        await interaction.deferUpdate();
        const ghosts = await logic.getGhostUsers(interaction.guild);

        if (ghosts.length === 0) return platformManager.showDiscordDashboard(interaction);

        const payload = ui.renderGhostPurgeList(ghosts);
        await interaction.editReply(payload);
    }

    async executeGhostPurge(interaction) {
        await interaction.deferUpdate();
        await interaction.editReply({ content: '🔥 מוחק נתונים...', embeds: [], components: [] });

        const ghosts = await logic.getGhostUsers(interaction.guild);
        const ids = ghosts.map(g => g.id);
        const result = await logic.executeGhostPurge(ids);

        await interaction.editReply({
            content: `✅ **התהליך הושלם!**\nנמחקו ${result} משתמשי רפאים.`,
            components: []
        });

        await platformManager.showDiscordDashboard(interaction);
    }

    // --- Kick Candidate ---

    async showKickCandidateList(interaction) {
        await interaction.deferUpdate();
        const candidates = await logic.getKickCandidates(interaction.guild);

        if (candidates.length === 0) return platformManager.showDiscordDashboard(interaction);

        const payload = ui.renderKickCandidateList(candidates);
        await interaction.editReply(payload);
    }

    async executeKick(interaction) {
        await interaction.editReply({ content: '💀 Kicking...', components: [] });
        const candidates = await logic.getKickCandidates(interaction.guild);
        const result = await logic.executeKickBatch(interaction.guild, candidates.map(c => c.userId));

        const embed = new EmbedBuilder().setTitle('PURGE REPORT').setColor('Green')
            .setDescription(`Removed: ${result.kicked.length}\nFailed: ${result.failed.length}`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_plat_dc_main').setLabel('DASHBOARD').setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    // --- Telegram ---

    async showTelegramMatchList(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        const { tgOrphans } = await logic.getMainStats(interaction.guild);

        // Logic handles sorting or picking the first one
        const match = tgOrphans.length > 0 ? tgOrphans[0] : null;
        const payload = ui.renderTelegramMatchList(match, tgOrphans.length);

        await interaction.editReply(payload);
    }

    async executeTelegramForceScan(interaction) {
        await interaction.deferUpdate();
        const callback = async (msg) => await interaction.followUp({ content: msg, flags: 64 });

        await callback('🕵️ מתחיל סריקה...');
        const count = await logic.executeTelegramForceScan(async (txt) => { /* internal progress updates if needed */ });

        await interaction.followUp({ content: `✅ הסריקה הסתיימה. כרגע יש **${count}** התאמות ממתינות.`, flags: 64 });
        await this.showTelegramMatchList(interaction);
    }

    async executeTelegramLink(interaction, tgId, discordId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        try {
            await logic.executeTelegramLink(tgId, discordId);
            await interaction.followUp({ content: '✅ **חובר בהצלחה!** (הוסר מהרשימות)', ephemeral: true });
            await platformManager.showTelegramDashboard(interaction);
        } catch (e) {
            await interaction.followUp({ content: '❌ שגיאה בחיבור.', ephemeral: true });
        }
    }

    async showTelegramManualLink(interaction) {
        await interaction.deferUpdate();
        const users = await logic.getTelegramUnlinkedUsers();
        const payload = ui.renderTelegramManualLink(users);
        if (payload.ephemeral) await interaction.followUp(payload);
        else await interaction.editReply(payload);
    }

    async handleTelegramManualSelect(interaction) {
        const tgId = interaction.values[0];
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`menu_tg_manual_confirm_${tgId}`)
            .setPlaceholder('בחר משתמש דיסקורד לשידוך');
        const row = new ActionRowBuilder().addComponents(userSelect);

        await interaction.update({
            content: `🔗 בחרת לחבר את ID: **${tgId}**\nבחר את משתמש הדיסקורד המתאים:`,
            components: [row]
        });
    }

    async finalizeTelegramManualLink(interaction) {
        const tgId = interaction.customId.split('_').pop();
        const discordId = interaction.values[0];
        await this.executeTelegramLink(interaction, tgId, discordId);
    }

    // Helper
    safeReply(interaction, content, ephemeral = true) {
        const payload = { content, embeds: [], components: [], files: [] };
        if (ephemeral) payload.flags = 64;
        if (interaction.replied || interaction.deferred) interaction.editReply(payload);
        else interaction.reply(payload);
    }
}

module.exports = new DashboardHandler();

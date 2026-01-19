const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('../../utils/logger');
const graphics = require('../graphics/core');
const db = require('../../utils/firebase');
const userManager = require('./manager'); // Reusing existing user logic
// const waSocket = require('../../whatsapp/socket'); // Will need this for WA Sync
// const tgScanner = require('../../telegram/utils/scanner'); // Will need this for TG

class PlatformManager {

    /**
     * 🟢 Entry Point: Main Platform Selector
     */
    async showMainSelector(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🌐 PLATFORM COMMAND CENTER')
                .setDescription('**Select a platform to manage:**\nAccess specific dashboards, diagnostics, and tools.')
                .setColor('#2b2d31') // Discord Dark
                .addFields(
                    { name: '🟢 WhatsApp', value: 'Connection status, Sync PFP, Orphan Links', inline: true },
                    { name: '✈️ Telegram', value: 'Detective Mode, Manual Linking, Radar', inline: true },
                    { name: '🎮 Discord', value: 'Ghost Purge, Role Sync, Inactivity', inline: true }
                )
                .setFooter({ text: 'Gamers United // Admin System v2.0' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_plat_wa_main').setLabel('WhatsApp').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('btn_plat_tg_main').setLabel('Telegram').setStyle(ButtonStyle.Primary).setEmoji('✈️'),
                new ButtonBuilder().setCustomId('btn_plat_dc_main').setLabel('Discord').setStyle(ButtonStyle.Secondary).setEmoji('🎮')
            );

            // Close button
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_plat_close').setLabel('Close Panel').setStyle(ButtonStyle.Danger).setEmoji('✖️')
            );

            const payload = { embeds: [embed], components: [row, row2], files: [] };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(payload);
            } else {
                await interaction.reply({ ...payload, flags: 64 });
            }

        } catch (error) {
            log(`❌ [PlatformManager] Error: ${error.message}`);
            this.safeReply(interaction, 'System Error', true);
        }
    }

    // --- � WHATSAPP DASHBOARD ---
    async showWhatsAppDashboard(interaction, isUpdate = true) {
        // Safety check: Don't defer if already handled (e.g. chaining from sync)
        if (!interaction.deferred && !interaction.replied) {
            if (!isUpdate) await interaction.deferReply({ flags: 64 });
            else await interaction.deferUpdate();
        }

        try {
            // Fetch Stats
            const db = require('../../utils/firebase');
            const { getSocket } = require('../../whatsapp/socket');

            const sock = getSocket();
            const deviceStatus = sock ? 'CONNECTED' : 'DISCONNECTED';

            // Count Linked Users
            const linkedSnapshot = await db.collection('users').where('identity.whatsappPhone', '!=', null).count().get();
            const linkedCount = linkedSnapshot.data().count;

            // Health Check (Missing PFP)
            const missingPfpSnapshot = await db.collection('users')
                .where('identity.whatsappPhone', '!=', null)
                .where('identity.avatar_whatsapp', '==', null) // Only checks if field is missing/null
                .count().get();
            const missingPfpCount = missingPfpSnapshot.data().count;

            const card = await this.generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_plat_wa_sync_pfp').setLabel('Force PFP Sync').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('btn_plat_wa_link').setLabel('Link Users').setStyle(ButtonStyle.Success).setEmoji('🔗'),
                new ButtonBuilder().setCustomId('btn_plat_main').setLabel('Back').setStyle(ButtonStyle.Secondary)
            );

            const payload = {
                embeds: [],
                files: [{ attachment: card, name: 'dashboard_wa.png' }],
                components: [row]
            };

            await interaction.editReply(payload);

        } catch (e) { log(`❌ [WA Dash] Error: ${e.message}`); }
    }

    // --- ✈️ TELEGRAM DASHBOARD ---
    async showTelegramDashboard(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        const db = require('../../utils/firebase');

        // Fetch Orphans
        const doc = await db.collection('system_metadata').doc('telegram_orphans').get();
        const orphans = doc.exists ? Object.values(doc.data().list || {}) : [];
        const avgConf = orphans.length > 0 ? Math.round(orphans.reduce((a, b) => a + b.confidence, 0) / orphans.length * 100) : 100;

        const card = await this.generateTelegramCard('POLLING', orphans.length, avgConf);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_plat_tg_scan').setLabel('Detective Mode').setStyle(ButtonStyle.Primary).setEmoji('🕵️'),
            new ButtonBuilder().setCustomId('btn_plat_tg_manage').setLabel('Manual Link').setStyle(ButtonStyle.Secondary).setEmoji('🔗'),
            new ButtonBuilder().setCustomId('btn_plat_main').setLabel('Back').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ files: [{ attachment: card, name: 'dashboard_tg.png' }], components: [row], embeds: [] });
    }

    // --- 🎮 DISCORD DASHBOARD ---
    async showDiscordDashboard(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        const db = require('../../utils/firebase');
        const userManager = require('./manager');

        // Fetch Stats
        const guild = interaction.guild;
        const memberCount = guild.memberCount;
        const ghostUsers = await userManager.getGhostUsers(guild); // Reusing logic
        const activityStats = await userManager.getInactivityStats(guild);

        const card = await this.generateDiscordCard(memberCount, ghostUsers.length, activityStats.dead.length);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_plat_dc_sync_names').setLabel('Sync Names').setStyle(ButtonStyle.Primary).setEmoji('🆔'),
            new ButtonBuilder().setCustomId('btn_plat_dc_purge').setLabel(`Purge Ghosts (${ghostUsers.length})`).setStyle(ButtonStyle.Danger).setEmoji('👻').setDisabled(ghostUsers.length === 0),
            new ButtonBuilder().setCustomId('btn_plat_dc_kick').setLabel(`Purge Inactive (${activityStats.dead.length})`).setStyle(ButtonStyle.Danger).setEmoji('💀').setDisabled(activityStats.dead.length === 0),
            new ButtonBuilder().setCustomId('btn_plat_main').setLabel('Back').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ files: [{ attachment: card, name: 'dashboard_dc.png' }], components: [row], embeds: [] });
    }

    // --- �🖋️ HTML GENERATORS ---

    getHtmlTemplate(title, color, stats, icon) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                body { margin:0; background:#050505; font-family:'Outfit', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; color:white; display:flex; align-items:center; justify-content:center; height:400px; width:800px; overflow:hidden; }
                .card { width:100%; height:100%; display:flex; padding:40px; box-sizing:border-box; background:radial-gradient(circle at top right, ${color}15 0%, #050505 60%); border: 1px solid ${color}33; position: relative; z-index: 1; }
                .left { flex:1; display:flex; flex-direction:column; justify-content:center; z-index: 2; }
                .right { width:320px; display:flex; flex-direction:column; gap:16px; justify-content:center; z-index: 2; }
                
                h1 { font-size:42px; margin:0; line-height:1; text-transform:uppercase; letter-spacing:1px; font-weight: 900; text-shadow: 0 0 20px ${color}44; }
                .subtitle { font-size:18px; color:#888; font-weight:700; margin-bottom:24px; text-transform:uppercase; letter-spacing:3px; display:flex; align-items:center; gap:10px; }
                
                .stat-box { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:16px 24px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; backdrop-filter: blur(10px); }
                .stat-label { color:#bbb; font-size:16px; font-weight:600; letter-spacing: 0.5px; }
                .stat-value { font-size:22px; font-weight:800; color:#fff; text-shadow: 0 0 10px ${color}66; }
                
                .status-badge { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:30px; background:${color}11; border:1px solid ${color}44; color:${color}; font-weight:bold; font-size:13px; margin-bottom:12px; width:fit-content; box-shadow: 0 0 15px ${color}11; }
                .icon-bg { position:absolute; right:-40px; bottom:-40px; font-size:350px; opacity:0.04; pointer-events:none; z-index: 0; filter: grayscale(100%); }
            </style>
        </head>
        <body>
            <div class="icon-bg">${icon}</div>
            <div class="card">
                <div class="left">
                    <div class="status-badge">● ONLINE</div>
                    <h1>${title}</h1>
                    <div class="subtitle">${icon} DASHBOARD</div>
                </div>
                <div class="right">
                    ${stats.map(s => `
                    <div class="stat-box">
                        <span class="stat-label">${s.label}</span>
                        <span class="stat-value">${s.value}</span>
                    </div>`).join('')}
                </div>
            </div>
        </body>
        </html>`;
    }

    async generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount) {
        const stats = [
            { label: 'DEVICE', value: deviceStatus },
            { label: 'LINKED USERS', value: linkedCount },
            { label: 'MISSING PFP', value: missingPfpCount || '✅' }
        ];
        return this.renderCard(this.getHtmlTemplate('WHATSAPP BRIDGE', '#00e676', stats, '💬'));
    }

    async generateTelegramCard(webhookStatus, orphansCount, confidence) {
        const stats = [
            { label: 'STATUS', value: webhookStatus },
            { label: 'SUSPECTS', value: orphansCount },
            { label: 'AVG CONFIDENCE', value: confidence + '%' }
        ];
        return this.renderCard(this.getHtmlTemplate('TELEGRAM SCOUT', '#29b6f6', stats, '✈️'));
    }

    async generateDiscordCard(memberCount, ghostCount, deadCount) {
        const stats = [
            { label: 'MEMBERS', value: memberCount },
            { label: 'DB GHOSTS', value: ghostCount },
            { label: 'INACTIVE', value: deadCount }
        ];
        return this.renderCard(this.getHtmlTemplate('DISCORD CORE', '#5865F2', stats, '🎮'));
    }

    async renderCard(html) {
        return await graphics.render(html, 800, 400);
    }

    // --- 🛠️ TOOLS & ACTIONS ---

    async syncWhatsAppAvatars(interaction) {
        await interaction.deferUpdate();
        await interaction.editReply({ content: '⏳ Running PFP Sync... This might take a moment.', files: [], components: [] });

        const db = require('../../utils/firebase');
        const { getSocket } = require('../../whatsapp/socket');
        const sock = getSocket();

        if (!sock) return this.safeReply(interaction, '❌ WhatsApp Socket Disconnected.', true);

        const snapshot = await db.collection('users').where('identity.whatsappPhone', '!=', null).get();
        let updatedCount = 0;
        let failedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const lid = data.platforms?.whatsapp_lid || data.identity?.whatsapp_lid;

            if (lid) {
                try {
                    const ppUrl = await sock.profilePictureUrl(lid, 'image').catch(() => null);
                    if (ppUrl) {
                        await doc.ref.update({
                            'identity.avatar_whatsapp': ppUrl,
                            'identity.avatarURL': ppUrl // Sync main avatar too if desired, or keep separate? 
                            // Strategy: Update both to ensure fresh look everywhere.
                        });
                        updatedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (e) { failedCount++; }

                // Rate limit protection
                await new Promise(r => setTimeout(r, 500));
            }
        }

        await interaction.editReply({
            content: `✅ **PFP Sync Complete!**\nUpdated: ${updatedCount}\nNo Image/Failed: ${failedCount}`,
            embeds: [], components: []
        });

        // Loop back to dashboard after 3s
        setTimeout(() => this.showWhatsAppDashboard(interaction), 3000);
    }

    // --- UTILS ---
    safeReply(interaction, content, ephemeral = true) {
        const payload = { content, embeds: [], components: [], files: [] };
        if (ephemeral) payload.flags = 64;
        if (interaction.replied || interaction.deferred) interaction.editReply(payload);
        else interaction.reply(payload);
    }
}

module.exports = new PlatformManager();

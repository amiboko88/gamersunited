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
                new ButtonBuilder().setCustomId('btn_plat_dc_main').setLabel('Discord').setStyle(ButtonStyle.Secondary).setEmoji('🎮'),
                new ButtonBuilder().setCustomId('btn_plat_stats').setLabel('Review Stats').setStyle(ButtonStyle.Danger).setEmoji('📊')
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

            // Count Linked Users (Exclude Shimon Bot)
            const linkedSnapshot = await db.collection('users')
                .where('platforms.whatsapp', '!=', null)
                .select('platforms.whatsapp') // Optimization: Fetch only this field
                .get();

            // Filter out Shimon (972549220819)
            const linkedCount = linkedSnapshot.docs.filter(doc => {
                const phone = doc.data().platforms?.whatsapp;
                return phone !== '972549220819';
            }).length;

            // Health Check (Missing PFP) - Check users who HAVE whatsapp but NO avatar
            const missingPfpSnapshot = await db.collection('users')
                .where('platforms.whatsapp', '!=', null)
                .where('identity.avatar_whatsapp', '==', null)
                .count().get();
            const missingPfpCount = missingPfpSnapshot.data().count;

            const card = await this.generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_plat_wa_sync_pfp').setLabel('Sync PFP').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
                new ButtonBuilder().setCustomId('btn_plat_wa_sync_members').setLabel('Sync Members (LID Patch)').setStyle(ButtonStyle.Primary).setEmoji('👥'),
                new ButtonBuilder().setCustomId('btn_plat_wa_scan').setLabel('Scan Group (Last 50)').setStyle(ButtonStyle.Danger).setEmoji('🕵️'),
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

    // --- �️ HTML GENERATORS (Moved to Graphics) ---
    // All card generation logic is now in handlers/graphics/dashboards.js 
    // to keep this file under 500 lines.

    async generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount) {
        const dashboardGraphics = require('../graphics/dashboards');
        return await dashboardGraphics.generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount);
    }

    async generateTelegramCard(webhookStatus, orphansCount, confidence) {
        const dashboardGraphics = require('../graphics/dashboards');
        return await dashboardGraphics.generateTelegramCard(webhookStatus, orphansCount, confidence);
    }

    async generateDiscordCard(memberCount, ghostCount, deadCount) {
        const dashboardGraphics = require('../graphics/dashboards');
        return await dashboardGraphics.generateDiscordCard(memberCount, ghostCount, deadCount);
    }

    // --- 🛠️ TOOLS & ACTIONS ---

    async syncWhatsAppAvatars(interaction) {
        // Prevent double deferral safely
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        await interaction.editReply({ content: '⏳ Suncing PFP... Starting...', files: [], components: [] });

        const db = require('../../utils/firebase');
        const { getSocket } = require('../../whatsapp/socket');
        const sock = getSocket();

        if (!sock) {
            log('❌ [PFP Sync] Socket is null');
            return this.safeReply(interaction, '❌ WhatsApp Socket Disconnected.', true);
        }

        try {
            const snapshot = await db.collection('users').where('identity.whatsappPhone', '!=', null).get();
            const total = snapshot.size;
            log(`🔄 [PFP Sync] Found ${total} users to sync.`);

            await interaction.editReply({ content: `⏳ Syncing ${total} users...`, files: [], components: [] });

            let updatedCount = 0;
            let failedCount = 0;

            // Process in chunks to avoid rate limits but speed up
            const chunks = [];
            const chunkSize = 10;
            for (let i = 0; i < total; i += chunkSize) {
                chunks.push(snapshot.docs.slice(i, i + chunkSize));
            }

            for (const [index, chunk] of chunks.entries()) {
                await Promise.all(chunk.map(async (doc) => {
                    const data = doc.data();
                    let lid = data.platforms?.whatsapp_lid || data.identity?.whatsapp_lid;
                    const phone = data.identity?.whatsappPhone;

                    let targetJid = lid;

                    // Fallback to Phone JID if LID is missing
                    if (!targetJid && phone) {
                        const cleanPhone = phone.replace(/\D/g, '');
                        targetJid = `${cleanPhone}@s.whatsapp.net`;
                    }

                    if (targetJid) {
                        try {
                            // 💡 TRICK: Subscribe to presence to force a server handshake regarding this user
                            // This often helps resolve privacy/visibility issues immediately
                            await sock.presenceSubscribe(targetJid).catch(() => { });

                            // 'image' gets high res. If fails, try undefined (thumb)
                            const ppUrl = await sock.profilePictureUrl(targetJid, 'image').catch(async (err) => {
                                // If 401/403/404, try standard resolution as fallback
                                if (err?.data === 401 || err?.data === 403 || err?.data === 404) return null;
                                return await sock.profilePictureUrl(targetJid).catch(() => null);
                            });

                            if (ppUrl) {
                                await doc.ref.update({
                                    'identity.avatar_whatsapp': ppUrl,
                                    'identity.avatarURL': ppUrl
                                });
                                updatedCount++;
                            } else {
                                // Privacy restricted or no photo - count as "failed" to sync but expected behavior
                                failedCount++;
                            }
                        } catch (e) {
                            // Network or critical errors
                            log(`❌ [PFP Sync] Exception for ${targetJid}: ${e.message}`);
                            failedCount++;
                        }
                    } else {
                        // Truly missing identity info
                        failedCount++;
                    }
                }));

                // Feedback update every chunk
                if (index % 2 === 0) {
                    await interaction.editReply({ content: `⏳ Syncing... (${updatedCount + failedCount}/${total})` });
                }

                // Brief pause between chunks only
                await new Promise(r => setTimeout(r, 200));
            }
            log(`✅ [PFP Sync] Finished. Updated: ${updatedCount}, Failed: ${failedCount}`);

            await interaction.editReply({
                content: `✅ **PFP Sync Complete!**\nSynced: ${updatedCount}/${total}\nFailed/No Pic: ${failedCount}`,
                embeds: [], components: []
            });

        } catch (error) {
            log(`❌ [PFP Sync] Fatal Error: ${error.message}`);
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }

        // Loop back to dashboard safe check
        setTimeout(() => this.showWhatsAppDashboard(interaction, true), 3000);
    }

    async syncWhatsAppMembers(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });

        const scout = require('../../whatsapp/utils/scout');
        const { getSocket } = require('../../whatsapp/socket');
        const sock = getSocket();
        const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

        if (!sock || !MAIN_GROUP_ID) return this.safeReply(interaction, '❌ WhatsApp disconnected.', true);

        try {
            await interaction.editReply('⏳ Syncing Group Members & Patching LIDs...');
            await scout.syncGroupMembers(sock, MAIN_GROUP_ID);
            await interaction.editReply('✅ **Sync Complete!** All LIDs patched.');
        } catch (e) {
            await interaction.editReply(`❌ Error: ${e.message}`);
        }
        setTimeout(() => this.showWhatsAppDashboard(interaction, true), 3000);
    }

    // --- 🕵️ SCAN LOGIC (Triggered by Button) ---
    async scanWhatsAppImages(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });

        const store = require('../../whatsapp/store');
        const { getSocket } = require('../../whatsapp/socket');
        const visionSystem = require('../media/vision');
        const codStats = require('../ai/tools/cod_stats');
        const { generateContent } = require('../ai/gemini');

        const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;
        const sock = getSocket();

        if (!sock || !MAIN_GROUP_ID) {
            return this.safeReply(interaction, '❌ WhatsApp disconnected or Group ID missing.', true);
        }

        try {
            const messages = store.getMessages(MAIN_GROUP_ID);
            log(`🕵️ [Scan] Checking ${messages.length} messages in memory for Group ${MAIN_GROUP_ID}...`);

            let foundImages = [];
            for (const m of messages) {
                const imgParams = m.message?.imageMessage;
                if (imgParams) foundImages.push(m);
            }

            if (foundImages.length === 0) {
                return interaction.editReply('🕵️ **Scan Complete:** No recent images found in memory (last 50 msgs).');
            }

            await interaction.editReply(`🕵️ Found **${foundImages.length}** images. Analyzing... ⏳`);

            // Download All
            const buffers = [];
            for (const imgMsg of foundImages) {
                try {
                    const buf = await visionSystem.downloadWhatsAppImage(imgMsg, sock);
                    if (buf) buffers.push(buf);
                } catch (e) { }
            }

            if (buffers.length === 0) return interaction.editReply('❌ Failed to download images (Too old?).');

            // Vision Extract Pipeline (Direct)
            const parts = [{ text: "Extract Warzone Scoreboard data from these images. Return JSON list: [{username, kills, damage, placement, mode}]. If not a scoreboard, return empty list." }];
            buffers.forEach(b => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }));

            const result = await generateContent(parts, "gemini-2.0-flash");

            const jsonMatch = result.match(/\[.*\]/s);
            if (!jsonMatch) {
                return interaction.editReply('❌ AI Analysis failed: No JSON found.');
            }

            const matches = JSON.parse(jsonMatch[0]);
            const saveArgs = { matches };

            // Save via COD Stats (Hashing handles duplicates)
            // UserId = 'AdminScan' makes it clear who triggered it
            const report = await codStats.execute(saveArgs, 'AdminScan', MAIN_GROUP_ID, buffers);

            await interaction.editReply({
                content: `✅ **Scan & Process Complete!**\n\n${report}\n\nCheck 'Review Stats' for any unknowns.`,
                embeds: [], components: []
            });

            // Loop back
            setTimeout(() => this.showWhatsAppDashboard(interaction, true), 5000);

        } catch (error) {
            log(`❌ [Scan] Error: ${error.message}`);
            interaction.editReply(`❌ Error: ${error.message}`);
        }
    }

    // --- 📊 STATS DASHBOARD (Moved to statsReview.js) ---
    async showStatsReview(interaction) {
        const statsReview = require('./statsReview');
        await statsReview.showStatsReview(interaction);
    }

    async handleStatsAction(interaction, action, docId) {
        const statsReview = require('./statsReview');
        await statsReview.handleStatsAction(interaction, action, docId);
    }

    async finalizeStatsLink(interaction, docId, targetUserId) {
        const statsReview = require('./statsReview');
        await statsReview.finalizeStatsLink(interaction, docId, targetUserId);
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

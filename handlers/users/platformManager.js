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

    // --- 📊 STATS DASHBOARD (New) ---
    async showStatsReview(interaction) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
        const db = require('../../utils/firebase');

        try {
            const pendingSnap = await db.collection('pending_stats').orderBy('timestamp', 'desc').limit(5).get();

            if (pendingSnap.empty) {
                return interaction.editReply({
                    content: '✅ **No Pending Stats to Review.** All clean!',
                    embeds: [], components: []
                });
            }

            const embeds = [];
            const rows = [];

            pendingSnap.forEach((doc, index) => {
                const data = doc.data();
                const embed = new EmbedBuilder()
                    .setTitle(`Unknown User: ${data.username}`)
                    .setDescription(`Matches found for **${data.username}** needs linking.`)
                    .addFields(
                        { name: 'Kills', value: `${data.kills}`, inline: true },
                        { name: 'Damage', value: `${data.damage}`, inline: true },
                        { name: 'Uploaded By', value: `${data.uploadedBy}`, inline: true }
                    )
                    .setColor('#FFA500'); // Orange

                if (data.proofUrl) embed.setThumbnail(data.proofUrl);

                embeds.push(embed);

                // Add Actions for this item
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_stat_approve_${doc.id}`).setLabel('Link User').setStyle(ButtonStyle.Success).setEmoji('🔗'),
                    new ButtonBuilder().setCustomId(`btn_stat_delete_${doc.id}`).setLabel('Discard').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                );
                rows.push(row);
            });

            await interaction.editReply({
                content: `**⚠️ Found ${pendingSnap.size} Pending Stats**\nReview below:`,
                embeds: embeds,
                components: rows
            });

        } catch (error) {
            log(`❌ [Stats Review] Error: ${error.message}`);
            interaction.editReply({ content: '❌ System Error loading stats.' });
        }
    }

    async handleStatsAction(interaction, action, docId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
        const db = require('../../utils/firebase');
        const userManager = require('./manager');

        try {
            const statRef = db.collection('pending_stats').doc(docId);
            const doc = await statRef.get();

            if (!doc.exists) {
                return interaction.editReply({ content: '❌ Stat record not found (Already processed?).' });
            }

            if (action === 'delete') {
                await statRef.delete();
                await interaction.editReply({ content: '🗑️ Deleted pending stat.' });
            }
            else if (action === 'approve') {
                // We need to ask WHICH user to link to.
                // Since this is a button click, we can't easily open a user select menu immediately if we are in ephemeral reply context sometimes.
                // Better approach: Show a User Select Menu now.

                const { StringSelectMenuBuilder, UserSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`menu_stat_link_user_${docId}`)
                    .setPlaceholder('Select the Discord User to link this score to')
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(userSelect);

                await interaction.editReply({
                    content: `🔗 **Linking Stats for '${doc.data().username}'**\nSelect the user below:`,
                    components: [row]
                });
                return; // Stop here, wait for menu selection
            }

            // Refresh default view
            setTimeout(() => this.showStatsReview(interaction), 2000);

        } catch (e) {
            log(`❌ [Stats Action] Error: ${e.message}`);
            interaction.editReply({ content: `Error: ${e.message}` });
        }
    }

    async finalizeStatsLink(interaction, docId, targetUserId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
        const db = require('../../utils/firebase');

        try {
            const statRef = db.collection('pending_stats').doc(docId);
            const statDoc = await statRef.get();

            if (!statDoc.exists) return interaction.editReply('❌ Stats gone.');

            const data = statDoc.data();
            const userRef = db.collection('users').doc(targetUserId);

            // 1. Save to User Profile
            await userRef.collection('games').add({
                game: 'Warzone',
                mode: data.mode || 'Unknown',
                kills: data.kills,
                damage: data.damage,
                placement: 0,
                evidence_batch: data.evidence_batch,
                timestamp: data.timestamp,
                manual_link: true
            });

            // 2. Add Alias to User Identity (So next time it auto-links)
            // We only add the exact username found in the image
            await userRef.set({
                identity: {
                    aliases: admin.firestore.FieldValue.arrayUnion(data.username.toLowerCase())
                }
            }, { merge: true });

            // 3. Delete Pending
            await statRef.delete();

            await interaction.editReply(`✅ **Linked!**\nStats moved to <@${targetUserId}>.\nAdded alias "${data.username}" for future auto-detection.`);

            setTimeout(() => this.showStatsReview(interaction), 3000);

        } catch (e) {
            log(`❌ [Stats Link] Error: ${e.message}`);
            interaction.editReply(`Error: ${e.message}`);
        }
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

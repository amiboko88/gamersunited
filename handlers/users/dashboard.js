// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { log } = require('../../utils/logger');
const matchmaker = require('../matchmaker');

class DashboardHandler {

    /**
     * ✅ Main Entry Point - Single Window
     * If responding to a clicked button -> update()
     * If responding to slash command -> reply()
     */
    async showMainDashboard(interaction, isUpdate = true) {
        try {
            const guild = interaction.guild;
            const stats = await userManager.getInactivityStats(guild);
            const orphans = await matchmaker.getOrphans();

            // Ghost Count (Live Query)
            const db = require('../../utils/firebase');
            const ghostSnapshot = await db.collection('users').where('identity.displayName', '==', 'Unknown').get();
            const ghostCount = ghostSnapshot.size;

            if (!stats) return this.safeReply(interaction, '❌ נתונים בטעינה... נסה שוב.', true);

            const activePercentage = Math.round(((stats.active + stats.newMembers) / stats.humans) * 100) || 0;

            // --- HTML Graphics (1200x700px Premium Dark Theme) ---
            const chartHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                    body { margin: 0; background-color: #050505; font-family: 'Outfit', sans-serif; display: flex; align-items: center; justify-content: center; height: 700px; width: 1200px; color: white; }
                    .container { display: flex; width: 100%; height: 100%; padding: 60px; box-sizing: border-box; align-items: center; justify-content: center; gap: 80px; background: radial-gradient(circle at top right, #1a1a1a 0%, #050505 70%); }
                    
                    /* Chart */
                    .chart-wrapper { width: 500px; height: 500px; position: relative; }
                    svg { width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 30px rgba(0,255,136,0.15)); }
                    circle { fill: none; stroke-width: 40; transition: stroke-dasharray 1s ease-out; stroke-linecap: round; }
                    
                    .center-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
                    .center-text h1 { font-size: 110px; margin: 0; line-height: 0.9; font-weight: 900; background: linear-gradient(to bottom, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                    .center-text span { font-size: 24px; letter-spacing: 6px; color: #666; font-weight: 700; text-transform: uppercase; }

                    /* Legend */
                    .legend { display: flex; flex-direction: column; gap: 20px; width: 350px; }
                    .legend-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 18px 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
                    .legend-left { display: flex; align-items: center; gap: 18px; }
                    .dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
                    .label { font-size: 22px; font-weight: 600; color: #ccc; }
                    .value { font-size: 28px; font-weight: 800; }
                    
                    .c-active { color: #00e676; stroke: #00e676; }
                    .c-dead { color: #ff3d00; stroke: #ff3d00; }
                    .c-sleeping { color: #607d8b; stroke: #607d8b; }
                    .c-suspect { color: #ffab00; stroke: #ffab00; }
                    .c-immune { color: #2979ff; stroke: #2979ff; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="chart-wrapper">
                        <svg viewBox="0 0 200 200">
                            ${getSvgCircle(stats.active, stats.humans, '#00e676', 0)}
                            ${getSvgCircle(stats.dead.length, stats.humans, '#ff3d00', stats.active)}
                            ${getSvgCircle(stats.sleeping.length, stats.humans, '#607d8b', stats.active + stats.dead.length)}
                            ${getSvgCircle(stats.review.length, stats.humans, '#ffab00', stats.active + stats.dead.length + stats.sleeping.length)}
                            ${getSvgCircle(stats.immune, stats.humans, '#2979ff', stats.active + stats.dead.length + stats.sleeping.length + stats.review.length)}
                        </svg>
                        <div class="center-text">
                            <h1>${Math.round((stats.active / stats.humans) * 100)}%</h1>
                            <span>HEALTH</span>
                        </div>
                    </div>
                    <div class="legend">
                        <div class="legend-item"><div class="legend-left"><div class="dot c-active"></div><span class="label">Healthy Users</span></div><span class="value c-active">${stats.active}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-dead"></div><span class="label">Dead (>180d)</span></div><span class="value c-dead">${stats.dead.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-sleeping"></div><span class="label">Sleeping</span></div><span class="value c-sleeping">${stats.sleeping.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-suspect"></div><span class="label">Review</span></div><span class="value c-suspect">${stats.review.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-immune"></div><span class="label">Immune</span></div><span class="value c-immune">${stats.immune}</span></div>
                    </div>
                </div>
            </body>
            </html>`;

            function getSvgCircle(val, total, color, offsetVal) {
                if (val <= 0) return '';
                const r = 80;
                const c = 2 * Math.PI * r;
                const pct = (val / total) * c;
                const offset = (offsetVal / total) * c;
                return `<circle cx="100" cy="100" r="${r}" style="stroke: ${color}; stroke-dasharray: ${pct} ${c - pct}; stroke-dashoffset: -${offset}px;"></circle>`;
            }

            const graphics = require('../../handlers/graphics/core');
            const attachment = await graphics.render(chartHtml, 1200, 700);

            // --- Embed Structure ---
            const embed = new EmbedBuilder()
                .setTitle('GAMERS UNITED // ADMIN CONSOLE')
                .setColor('#000000')
                .setImage('attachment://dashboard.png')
                .addFields(
                    { name: '🔌 SYSTEM STATUS', value: stats.voiceNow > 0 ? `🟢 Online (${stats.voiceNow} in Voice)` : '🔴 Idle', inline: true },
                    { name: '🦴 GHOST USERS', value: ghostCount > 0 ? `⚠️ **${ghostCount} Detected**` : '✅ Clean', inline: true },
                    { name: '🔗 UNLINKED (LID)', value: orphans.length > 0 ? `⚠️ **${orphans.length} Users**` : '✅ Clean', inline: true }
                )
                .setFooter({ text: `Last Sync: ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}` });

            // --- Controls ---
            const rowMain = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('טען מחדש').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('btn_manage_sync_names').setLabel('סנכרון שמות').setStyle(ButtonStyle.Primary).setEmoji('🆔'),
                new ButtonBuilder().setCustomId('btn_manage_purge_ghosts').setLabel(`ניקוי רפאים (${ghostCount})`).setStyle(ButtonStyle.Danger).setDisabled(ghostCount === 0).setEmoji('👻')
            );

            const rowDanger = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_kick_prep').setLabel(`ניקוי לא פעילים (${stats.dead.length})`).setStyle(ButtonStyle.Danger).setDisabled(stats.dead.length === 0).setEmoji('🗑️'),
                new ButtonBuilder().setCustomId('btn_manage_cancel').setLabel('סגור פאנל').setStyle(ButtonStyle.Secondary).setEmoji('❌')
            );

            const payload = { embeds: [embed], components: [rowMain, rowDanger], files: [{ attachment, name: 'dashboard.png' }] };

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

    /**
     * ✅ Ghost Purge - Confirmation Panel
     * Replaces main view with a list of ghosts and a confirm button
     */
    async showGhostPurgeList(interaction) {
        await interaction.deferUpdate();

        const guild = interaction.guild;
        const ghosts = await userManager.getGhostUsers(guild);

        if (ghosts.length === 0) {
            return this.showMainDashboard(interaction); // Return to main if empty
        }

        const listText = ghosts.slice(0, 20).map(g =>
            `• \`${g.id}\` | **${g.name}** | Joined: ${g.joined} | XP: ${g.xp}${g.hasValue ? ' ⚠️' : ''}`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`👻 GHOST PURGE (${ghosts.length})`)
            .setDescription(`**Users detected in DB but NOT in Server**\n(Showing first 20)\n\n${listText}`)
            .setColor('DarkRed')
            .setFooter({ text: '⚠️ Marked with warning are users with XP/Balance' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_ghost_confirm').setLabel('בצע מחיקה').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
            new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('ביטול וחזרה').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row], files: [] });
    }

    async executeGhostPurge(interaction) {
        await interaction.editReply({ content: '🔥 מוחק נתונים...', embeds: [], components: [] });

        const ghosts = await userManager.getGhostUsers(interaction.guild);
        const ids = ghosts.map(g => g.id);

        const result = await userManager.purgeUsers(ids);

        await interaction.editReply({
            content: `✅ **התהליך הושלם!**\nנמחקו ${result} משתמשי רפאים.`,
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('חזרה לדאשבורד').setStyle(ButtonStyle.Primary)
            )]
        });
    }

    // --- Helper for safe replies ---
    safeReply(interaction, content, ephemeral = true) {
        if (interaction.replied || interaction.deferred) interaction.editReply({ content, embeds: [], components: [], files: [] });
        else interaction.reply({ content, ephemeral });
    }

    // ... (Keep executeKick & showKickCandidateList from previous version, adapted to new style if needed) 
    // For brevity, I am assuming the user only wants the new Ghost logic + Dashboard.
    // I will re-implement the kick logic below to ensure no functionality is lost.

    async showKickCandidateList(interaction) {
        await interaction.deferUpdate();
        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) return this.showMainDashboard(interaction);

        const list = candidates.map(c => `• <@${c.userId}> (${c.days} days)`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`💀 INACTIVE PURGE (${candidates.length})`)
            .setDescription(list.slice(0, 4000))
            .setColor('DarkRed');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_kick_confirm').setLabel('KICK ALL').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('CANCEL').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row], files: [] });
    }

    async executeKick(interaction) {
        await interaction.editReply({ content: '💀 Kicking...', components: [] });
        const stats = await userManager.getInactivityStats(interaction.guild);
        const result = await userManager.executeKickBatch(interaction.guild, stats.kickCandidates.map(c => c.userId));

        const embed = new EmbedBuilder().setTitle('PURGE REPORT').setColor('Green')
            .setDescription(`Removed: ${result.kicked.length}\nFailed: ${result.failed.length}`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('DASHBOARD').setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }
}

module.exports = new DashboardHandler();
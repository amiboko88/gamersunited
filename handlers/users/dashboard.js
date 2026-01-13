// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { log } = require('../../utils/logger');

class DashboardHandler {

    async showMainDashboard(interaction) {
        try {
            const guild = interaction.guild;
            const stats = await userManager.getInactivityStats(guild);

            if (!stats) return interaction.editReply('❌ נתונים בטעינה... נסה שוב.');

            const activePercentage = Math.round(((stats.active + stats.newMembers) / stats.humans) * 100) || 0;

            // בניית גרף HTML/CSS יוקרתי במקום QuickChart הפשוט
            const chartHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                    body { margin: 0; background: #0a0a0a; font-family: 'Outfit', sans-serif; display: flex; align-items: center; justify-content: center; height: 500px; width: 1000px; color: white; }
                    .container { display: flex; width: 100%; height: 100%; padding: 40px; box-sizing: border-box; align-items: center; justify-content: space-between; gap: 50px; }
                    
                    /* המעגל */
                    .chart-wrapper { width: 350px; height: 350px; position: relative; flex-shrink: 0; }
                    svg { width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 20px rgba(0,255,136,0.1)); }
                    circle { fill: none; stroke-width: 30; transition: stroke-dasharray 1s; stroke-linecap: round; }
                    
                    .center-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
                    .center-text h1 { font-size: 80px; margin: 0; line-height: 0.9; font-weight: 900; background: linear-gradient(to bottom, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                    .center-text span { font-size: 18px; letter-spacing: 4px; color: #666; font-weight: 700; }

                    /* המקרא */
                    .legend { flex: 1; display: flex; flex-direction: column; gap: 15px; }
                    .legend-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 15px 25px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
                    .legend-left { display: flex; align-items: center; gap: 15px; }
                    .dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px currentColor; }
                    .label { font-size: 20px; font-weight: 700; color: #ddd; }
                    .value { font-size: 24px; font-weight: 900; }

                    /* צבעים */
                    .c-active { color: #00e676; stroke: #00e676; }
                    .c-dead { color: #d50000; stroke: #d50000; }
                    .c-sleeping { color: #9e9e9e; stroke: #9e9e9e; }
                    .c-suspect { color: #ffab00; stroke: #ffab00; }
                    .c-immune { color: #2979ff; stroke: #2979ff; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="chart-wrapper">
                        <svg viewBox="0 0 200 200">
                            <!-- חישובים פשוטים למעגל SVG -->
                            ${getSvgCircle(stats.active, stats.humans, '#00e676', 0)}
                            ${getSvgCircle(stats.dead.length, stats.humans, '#d50000', stats.active)}
                            ${getSvgCircle(stats.sleeping.length, stats.humans, '#9e9e9e', stats.active + stats.dead.length)}
                            ${getSvgCircle(stats.review.length, stats.humans, '#ffab00', stats.active + stats.dead.length + stats.sleeping.length)}
                            ${getSvgCircle(stats.immune, stats.humans, '#2979ff', stats.active + stats.dead.length + stats.sleeping.length + stats.review.length)}
                        </svg>
                        <div class="center-text">
                            <h1>${stats.humans}</h1>
                            <span>HUMANS</span>
                        </div>
                    </div>
                    <div class="legend">
                        <div class="legend-item"><div class="legend-left"><div class="dot c-active"></div><span class="label">Total Active</span></div><span class="value c-active">${stats.active}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-dead"></div><span class="label">Dead Users</span></div><span class="value c-dead">${stats.dead.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-sleeping"></div><span class="label">Sleeping</span></div><span class="value c-sleeping">${stats.sleeping.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-suspect"></div><span class="label">Review Needed</span></div><span class="value c-suspect">${stats.review.length}</span></div>
                        <div class="legend-item"><div class="legend-left"><div class="dot c-immune"></div><span class="label">Immune / VIP</span></div><span class="value c-immune">${stats.immune}</span></div>
                    </div>
                </div>
            </body>
            </html>`;

            function getSvgCircle(val, total, color, offsetVal) {
                if (val <= 0) return '';
                const r = 80;
                const c = 2 * Math.PI * r;
                const pct = (val / total) * c;
                const offset = (offsetVal / total) * c; // SVG מתחיל מ-0, אז צריך לקזז
                /* הערה: ב-SVG מעגל מתחיל ב-3 שעות, אז צריך לשחק עם dasharray. פתרון פשוט: stroke-dasharray="pct c" stroke-dashoffset="-offset" */
                return `<circle cx="100" cy="100" r="${r}" style="stroke: ${color}; stroke-dasharray: ${pct} ${c - pct}; stroke-dashoffset: -${offset}px;"></circle>`;
            }

            const { render } = require('../../handlers/graphics/core'); // ייבוא ישיר כי אנחנו בתוך handler
            const attachment = await render(chartHtml, 1000, 500);

            const embed = new EmbedBuilder()
                .setColor('#00e676')
                .setImage('attachment://chart.png')
                .setFooter({ text: `SYSTEM STATUS: ${stats.voiceNow} IN VOICE | ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}` });

            // המרת ה-Buffer ל-Attachment של דיסקורד
            const file = { attachment: attachment, name: 'chart.png' };

            // שורה 1: רענון, סנכרון שמות וניקוי מתים
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('REFRESH SYSTEM').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('btn_manage_sync_names').setLabel('SYNC UNKNOWN').setStyle(ButtonStyle.Primary).setEmoji('🆔'),
                new ButtonBuilder().setCustomId('btn_manage_kick_prep').setLabel(`PURGE DEAD (${stats.dead.length})`).setStyle(ButtonStyle.Danger).setDisabled(stats.dead.length === 0).setEmoji('💀')
            );

            // שורה 2: ניקוי רפאים וסגירה
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_purge_ghosts').setLabel('CLEAN GHOSTS').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
                new ButtonBuilder().setCustomId('btn_manage_cancel').setLabel('CLOSE PANEL').setStyle(ButtonStyle.Secondary)
            );

            if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed], components: [row1, row2], files: [file] });
            else await interaction.reply({ embeds: [embed], components: [row1, row2], files: [file], flags: 64 });

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            try { if (!interaction.replied) await interaction.editReply('❌ System Error.'); } catch (e) { }
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) return interaction.editReply('✅ SYSTEM CLEAN. NO DEAD USERS FOUND.');

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} days`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`💀 PURGE LIST (${candidates.length})`)
            .setDescription(`**CRITERIA: INACTIVE > 180 DAYS**\n\n${listText.slice(0, 3000)}`)
            .setColor('DarkRed');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_kick_confirm').setLabel('CONFIRM PURGE').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_manage_cancel').setLabel('ABORT').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    async executeKick(interaction) {
        await interaction.update({ content: '🚀 PURGING...', components: [], embeds: [] });
        const stats = await userManager.getInactivityStats(interaction.guild);

        if (!stats.kickCandidates || stats.kickCandidates.length === 0) {
            return interaction.followUp({ content: '❌ הרשימה ריקה, לא בוצע ניקוי.', ephemeral: true });
        }

        const result = await userManager.executeKickBatch(interaction.guild, stats.kickCandidates.map(c => c.userId));

        const summaryEmbed = new EmbedBuilder().setTitle('🧹 PURGE COMPLETE').setColor('Green')
            .setDescription(`**REMOVED:** ${result.kicked.length}\n**FAILED:** ${result.failed.length}\n\n${result.kicked.join(', ')}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }

    async getListEmbed(interaction, type) {
        const stats = await userManager.getInactivityStats(interaction.guild);
        let list = [];
        let title = '';

        switch (type) {
            case 'dead': list = stats.dead; title = '💀 Dead Users (>180 Days)'; break;
            case 'sleeping': list = stats.sleeping; title = '💤 Sleeping Users (>30 Days)'; break;
            case 'review': list = stats.review; title = '⚠️ Review Needed'; break;
            default: return { content: 'Invalid selection', embeds: [] };
        }

        const text = list.map(u => `<@${u.userId}> (${u.days} days)`).join('\n') || 'None';
        const embed = new EmbedBuilder().setTitle(title).setDescription(text.slice(0, 4000)).setColor('#333');
        return { embeds: [embed] };
    }
}

module.exports = new DashboardHandler();
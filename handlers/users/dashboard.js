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

            // חישוב אחוז פעילות
            const activePercentage = Math.round(((stats.active + stats.newMembers) / stats.humans) * 100) || 0;

            // עיצוב HUD שחור
            const hudConfig = {
                type: 'doughnut',
                data: {
                    labels: ['פעילים', 'מתים', 'רדומים', 'חשודים', 'חסינים'],
                    datasets: [{
                        data: [stats.active, stats.dead.length, stats.sleeping.length, stats.review.length, stats.immune],
                        backgroundColor: ['#00E676', '#D50000', '#9E9E9E', '#FFAB00', '#2979FF'],
                        borderWidth: 0
                    }]
                },
                options: {
                    legend: { display: true, position: 'right', labels: { fontColor: 'white', fontSize: 18, padding: 20 } },
                    cutoutPercentage: 70,
                    plugins: {
                        datalabels: { display: true, color: 'white', font: { weight: 'bold', size: 24 } },
                        doughnutlabel: {
                            labels: [
                                { text: `${stats.humans}`, font: { size: 40, color: 'white', weight: 'bold' } },
                                { text: 'HUMANS', font: { size: 14, color: '#888888' } }
                            ]
                        }
                    }
                }
            };

            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(hudConfig))}&backgroundColor=%23121212&width=800&height=400`;

            const embed = new EmbedBuilder()
                .setColor('#121212')
                .setTitle(`📡 MONITOR: ${guild.name.toUpperCase()}`)
                .setImage(chartUrl)
                .addFields(
                    { name: '🟢 פעילות', value: `Active: **${stats.active}**\nNew: **${stats.newMembers}**`, inline: true },
                    { name: '🔴 סכנה', value: `Dead (6mo+): **${stats.dead.length}**\nSleeping: **${stats.sleeping.length}**`, inline: true },
                    { name: '🛡️ סטטוס', value: `Voice: **${stats.voiceNow}**\nImmune: **${stats.immune}**`, inline: true }
                )
                .setFooter({ text: `SYSTEM STATUS: ONLINE | ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('REFRESH SYSTEM').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('btn_manage_kick_prep').setLabel(`PURGE DEAD (${stats.dead.length})`).setStyle(ButtonStyle.Danger).setDisabled(stats.dead.length === 0).setEmoji('💀')
            );

            if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed], components: [row] });
            else await interaction.reply({ embeds: [embed], components: [row], flags: 64 });

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            try { if (!interaction.replied) await interaction.editReply('❌ System Error.'); } catch (e) {}
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates; // רק מתים

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
        
        // הגנה: אם אין את מי להעיף
        if (!stats.kickCandidates || stats.kickCandidates.length === 0) {
             return interaction.followUp({ content: '❌ הרשימה ריקה, לא בוצע ניקוי.', ephemeral: true });
        }

        const result = await userManager.executeKickBatch(interaction.guild, stats.kickCandidates.map(c => c.userId));

        const summaryEmbed = new EmbedBuilder().setTitle('🧹 PURGE COMPLETE').setColor('Green')
            .setDescription(`**REMOVED:** ${result.kicked.length}\n**FAILED:** ${result.failed.length}\n\n${result.kicked.join(', ')}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }

    // ✅ הוספתי את הפונקציה החסרה למקרה שתרצה להציג רשימות מפורטות בעתיד
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
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(text.slice(0, 4000))
            .setColor('#333');

        return { embeds: [embed] };
    }
}

module.exports = new DashboardHandler();
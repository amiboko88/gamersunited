// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { generateStatusPieChart } = require('../../utils/graphGenerator');
const { createPaginatedFields } = require('../../utils/embedUtils');

class DashboardHandler {

    async getDashboard(interaction) {
        const stats = await userManager.getInactivityStats(interaction.guild);
        
        // יצירת גרף (אם הפונקציה קיימת ב-utils)
        let chartUrl = null;
        try {
            chartUrl = await generateStatusPieChart(stats);
        } catch (e) {
            console.error('Graph generation failed:', e);
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 מרכז ניהול משתמשים')
            .setDescription(`**מצב הקהילה בזמן אמת:**\nסה"כ חברים בשרת: **${stats.total}**`)
            .addFields(
                { name: '🟢 פעילים', value: `${stats.active}`, inline: true },
                { name: '🟡 רדומים (7+)', value: `${stats.inactive7.length}`, inline: true },
                { name: '🟠 בסיכון (14+)', value: `${stats.inactive14.length}`, inline: true },
                { name: '🔴 להרחקה (30+)', value: `${stats.inactive30.length}`, inline: true },
                { name: '❌ כשלי DM', value: `${stats.failedDM.length}`, inline: true }
            )
            .setColor('#2b2d31')
            .setFooter({ text: 'AI 2026 User Management System' })
            .setTimestamp();

        if (chartUrl) embed.setImage(chartUrl);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('users_dashboard_select')
            .setPlaceholder('🔍 בחר קטגוריה להצגה')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('רענן נתונים').setValue('refresh').setEmoji('🔄'),
                new StringSelectMenuOptionBuilder().setLabel('הצג מועמדים להרחקה (30+)').setValue('list_kick').setEmoji('🔴'),
                new StringSelectMenuOptionBuilder().setLabel('הצג רדומים (7+)').setValue('list_warning').setEmoji('🟡')
            );

        const kickButton = new ButtonBuilder()
            .setCustomId('users_kick_action')
            .setLabel(`נקה משתמשים לא פעילים (${stats.kickCandidates.length})`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(stats.kickCandidates.length === 0)
            .setEmoji('🗑️');

        const row1 = new ActionRowBuilder().addComponents(menu);
        const row2 = new ActionRowBuilder().addComponents(kickButton);

        return { embeds: [embed], components: [row1, row2] };
    }

    async getListEmbed(interaction, type) {
        const stats = await userManager.getInactivityStats(interaction.guild);
        let list = [];
        let title = '';
        let color = '';

        if (type === 'list_kick') {
            list = [...stats.inactive30.map(u => u.userId), ...stats.failedDM];
            title = '🔴 מועמדים להרחקה (30+ יום או DM חסום)';
            color = 'Red';
        } else if (type === 'list_warning') {
            list = stats.inactive7.map(u => u.userId);
            title = '🟡 משתמשים רדומים (7-14 יום)';
            color = 'Yellow';
        }

        const embed = new EmbedBuilder().setTitle(title).setColor(color);
        
        if (list.length === 0) {
            embed.setDescription('✅ הרשימה ריקה.');
        } else {
            const formattedList = list.map(id => `<@${id}>`);
            const fields = createPaginatedFields('משתמשים', formattedList);
            fields.slice(0, 25).forEach(f => embed.addFields(f));
        }

        return { embeds: [embed] };
    }
}

module.exports = new DashboardHandler();
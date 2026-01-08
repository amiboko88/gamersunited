// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const userManager = require('./manager');
const { generateStatusPieChart } = require('../../utils/graphGenerator'); // וודא שזה קיים
const { log } = require('../../utils/logger');

class DashboardHandler {

    /**
     * הצגת הדשבורד הראשי (פקודת /manage)
     */
    async showMainDashboard(interaction) {
        try {
            const guild = interaction.guild;
            const stats = await userManager.getInactivityStats(guild);
            
            if (!stats) {
                return interaction.editReply('❌ לא ניתן למשוך נתונים כרגע.');
            }

            // יצירת גרף
            let files = [];
            try {
                // הנחה: generateStatusPieChart מחזיר Buffer של תמונה
                const chartBuffer = await generateStatusPieChart(stats);
                const attachment = new AttachmentBuilder(chartBuffer, { name: 'stats_chart.png' });
                files.push(attachment);
            } catch (e) {
                console.error('Graph Error:', e);
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 מרכז ניהול משתמשים - שמעון')
                .setDescription(`דוח מצב קהילה בזמן אמת עבור **${guild.name}**`)
                .setColor('Blue')
                .addFields(
                    { name: '👥 סה"כ חברים', value: `${stats.total}`, inline: true },
                    { name: '🟢 פעילים', value: `${stats.active}`, inline: true },
                    { name: '🛡️ חסינים (MVP)', value: `${stats.immune}`, inline: true },
                    { name: '🟡 רדומים (7+ יום)', value: `${stats.inactive7.length}`, inline: true },
                    { name: '🟠 בסיכון (14+ יום)', value: `${stats.inactive14.length}`, inline: true },
                    { name: '🔴 להרחקה (30+ יום)', value: `${stats.inactive30.length}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'לחיצה על "הכן רשימה" לא תמחק מיידית' });

            if (files.length > 0) {
                embed.setImage('attachment://stats_chart.png');
            }

            // כפתורים
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_manage_refresh')
                    .setLabel('רענן נתונים')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                
                new ButtonBuilder()
                    .setCustomId('btn_manage_kick_prep')
                    .setLabel(`הכן רשימת הרחקה (${stats.inactive30.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.inactive30.length === 0) // מושבת אם אין את מי להעיף
                    .setEmoji('🗑️')
            );

            await interaction.editReply({ embeds: [embed], components: [row], files: files });

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            await interaction.editReply('❌ אירעה שגיאה בטעינת הדשבורד.');
        }
    }

    /**
     * שלב 2: הצגת רשימת המועמדים להרחקה לאישור
     */
    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true }); // אישי למנהל

        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) {
            return interaction.editReply('✅ אין מועמדים להרחקה כרגע. כולם פעילים!');
        }

        // יצירת טקסט לרשימה (עד 2000 תווים או קובץ)
        // אם הרשימה ארוכה מדי, ניצור קובץ טקסט
        const listText = candidates.map(c => `• ${c.name} (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ אישור ביצוע הרחקה')
            .setDescription(`המשתמשים הבאים לא היו פעילים מעל 30 יום ואינם חסינים:\n\n${listText.slice(0, 1500)}${listText.length > 1500 ? '...\n(ונוספים בקובץ)' : ''}`)
            .setColor('Red')
            .setFooter({ text: 'פעולה זו היא סופית! לחץ על אישור לביצוע.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_manage_kick_confirm')
                .setLabel('🚨 אשר ובעט את כולם')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('btn_manage_cancel')
                .setLabel('ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        // אם הרשימה ארוכה, נצרף קובץ
        let files = [];
        if (listText.length > 1000) {
            const buffer = Buffer.from(listText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: 'kick_list.txt' });
            files.push(attachment);
        }

        await interaction.editReply({ embeds: [embed], components: [row], files: files });
    }

    /**
     * שלב 3: הביצוע בפועל
     */
    async executeKick(interaction) {
        await interaction.update({ content: '🚀 מבצע ניקוי... אנא המתן.', components: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 תוצאות הניקוי')
            .setColor('Green')
            .addFields(
                { name: '✅ הורחקו בהצלחה', value: `${result.kicked.length} משתמשים`, inline: true },
                { name: '❌ נכשלו', value: `${result.failed.length}`, inline: true }
            )
            .setDescription(`**הורחקו:**\n${result.kicked.join(', ') || 'אף אחד'}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
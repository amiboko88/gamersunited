// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { log } = require('../../utils/logger');

class DashboardHandler {

    async showMainDashboard(interaction) {
        try {
            const guild = interaction.guild;
            // משיכת נתונים (עכשיו עם Timeout ארוך יותר ב-manager)
            const stats = await userManager.getInactivityStats(guild);
            
            if (!stats) {
                return interaction.editReply('❌ לא ניתן למשוך נתונים כרגע.');
            }

            // --- יצירת גרף פאי יפה (QuickChart) ---
            const chartConfig = {
                type: 'outlabeledPie',
                data: {
                    labels: ['פעילים', 'חסינים (MVP)', 'רדומים (7+)', 'בסיכון (14+)', 'להרחקה (30+)'],
                    datasets: [{
                        data: [stats.active, stats.immune, stats.inactive7.length, stats.inactive14.length, stats.inactive30.length],
                        backgroundColor: ['#4CAF50', '#2196F3', '#FFC107', '#FF9800', '#F44336']
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        outlabels: {
                            text: '%l %p',
                            color: 'white',
                            stretch: 20,
                            font: { resizable: true, minSize: 12, maxSize: 18 }
                        }
                    }
                }
            };
            
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=transparent&width=500&height=300`;
            // ----------------------------------------

            const embed = new EmbedBuilder()
                .setTitle(`📊 מרכז הקהילה - ${guild.name}`)
                .setDescription(`**סה"כ חברים בשרת:** ${stats.total}\n(כולל ${stats.newMembers} חדשים מהשבוע האחרון)`)
                .setColor('Blue')
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setImage(chartUrl) // הגרף היפה
                .addFields(
                    { name: '🟢 פעילים', value: `${stats.active}`, inline: true },
                    { name: '🛡️ חסינים', value: `${stats.immune}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // רווח
                    { name: '🟡 רדומים', value: `${stats.inactive7.length}`, inline: true },
                    { name: '🟠 בסיכון', value: `${stats.inactive14.length}`, inline: true },
                    { name: '🔴 להרחקה', value: `${stats.inactive30.length}`, inline: true }
                )
                .setFooter({ text: `עודכן לאחרונה: ${new Date().toLocaleTimeString('he-IL')}` });

            // כפתורים
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_manage_refresh')
                    .setLabel('רענן')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                
                new ButtonBuilder()
                    .setCustomId('btn_manage_kick_prep')
                    .setLabel(`הכן רשימת הרחקה (${stats.inactive30.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.inactive30.length === 0)
                    .setEmoji('🗑️')
            );

            // טיפול בעדכון הודעה קיימת או שליחה חדשה
            if (interaction.isButton()) {
                await interaction.editReply({ embeds: [embed], components: [row], files: [] }); // מנקים קבצים ישנים
            } else {
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            // במקרה של שגיאה, מנסים לשלוח הודעה פשוטה
            try {
                 await interaction.editReply('❌ אירעה שגיאה בטעינת הדשבורד הגרפי.');
            } catch (e) {}
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) {
            return interaction.editReply('✅ הרשימה ריקה! כולם פעילים או מוגנים.');
        }

        // יצירת טקסט לרשימה
        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ אישור הרחקה סופי')
            .setDescription(`המשתמשים הבאים מועמדים להרחקה:\n\n${listText.slice(0, 3000)}`) // דיסקורד תומך עד 4096 בתיאור, נגביל לביטחון
            .setColor('Red')
            .setFooter({ text: 'לחץ על "אשר" לביצוע המחיקה.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_manage_kick_confirm')
                .setLabel('🚨 בצע ניקוי עכשיו')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('btn_manage_cancel')
                .setLabel('ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    async executeKick(interaction) {
        await interaction.update({ content: '🚀 מבצע ניקוי... זה ייקח רגע.', components: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 סיכום ניקוי')
            .setColor('Green')
            .setDescription(`**הורחקו בהצלחה:** ${result.kicked.length}\n**נכשלו:** ${result.failed.length}\n\n**שמות:** ${result.kicked.join(', ') || 'אף אחד'}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
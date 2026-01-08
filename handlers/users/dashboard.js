// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { log } = require('../../utils/logger');

class DashboardHandler {

    async showMainDashboard(interaction) {
        try {
            const guild = interaction.guild;
            const stats = await userManager.getInactivityStats(guild);
            
            if (!stats) {
                return interaction.editReply('❌ שגיאה בטעינת נתונים.');
            }

            // --- עיצוב גרף 2026 (Donut Dark Mode) ---
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: [
                        `פעילים (${stats.active})`, 
                        `חסינים (${stats.immune})`, 
                        `רדומים 7+ (${stats.inactive7.length})`, 
                        `בסיכון 14+ (${stats.inactive14.length})`, 
                        `להרחקה 30+ (${stats.inactive30.length})`
                    ],
                    datasets: [{
                        data: [stats.active, stats.immune, stats.inactive7.length, stats.inactive14.length, stats.inactive30.length],
                        backgroundColor: ['#00E676', '#2979FF', '#FFEA00', '#FF9100', '#FF1744'],
                        borderColor: '#2B2D31', // צבע רקע של דיסקורד להפרדה
                        borderWidth: 2
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            display: true,
                            position: 'right',
                            labels: {
                                fontColor: 'white',
                                fontSize: 16,
                                padding: 20
                            }
                        },
                        doughnutlabel: {
                            labels: [
                                { text: `${stats.humans}`, font: { size: 30, color: 'white' } },
                                { text: 'בני אנוש', font: { size: 14, color: '#cccccc' } }
                            ]
                        }
                    }
                }
            };
            
            // יצירת URL עם רקע כהה מותאם
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=%232B2D31&width=600&height=300`;

            // --- בניית ה-Embed הנקי ---
            const embed = new EmbedBuilder()
                .setColor('#2B2D31') // משתלב עם הרקע
                .setTitle(`🚀 דשבורד קהילה: ${guild.name}`)
                // תיאור מינימליסטי כי הכל בתמונה
                .setDescription(`סה"כ בשרת: **${stats.total}** (כולל בוטים)\nחברים חדשים השבוע: **${stats.newMembers}**`) 
                .setImage(chartUrl)
                .setFooter({ 
                    text: `עודכן: ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
                    iconURL: guild.iconURL()
                });

            // כפתורים
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_manage_refresh')
                    .setLabel('רענן נתונים')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄'),
                
                new ButtonBuilder()
                    .setCustomId('btn_manage_kick_prep')
                    .setLabel(`ניקוי (${stats.inactive30.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.inactive30.length === 0)
                    .setEmoji('🗑️')
            );

            // עדכון ההודעה
            if (interaction.isButton()) {
                // טריק: משנים את הכפתור ל"טוען" לשבריר שניה כדי לתת פידבק
                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            try { await interaction.editReply('❌ שגיאה בטעינת הגרף.'); } catch (e) {}
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) {
            return interaction.editReply('✅ השרת נקי! אין מועמדים להרחקה.');
        }

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ רשימת הרחקה (Pre-Flight Check)')
            .setDescription(`**סה"כ להרחקה:** ${candidates.length}\n\n${listText.slice(0, 3000)}`)
            .setColor('Red')
            .setFooter({ text: 'פעולה זו היא סופית.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_manage_kick_confirm')
                .setLabel('🔥 בצע הרחקה')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('btn_manage_cancel')
                .setLabel('ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    async executeKick(interaction) {
        await interaction.update({ content: '🚀 מבצע ניקוי... נא להמתין.', components: [], embeds: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 דוח ביצוע')
            .setColor('Green')
            .addFields(
                { name: 'הורחקו', value: `${result.kicked.length}`, inline: true },
                { name: 'נכשלו', value: `${result.failed.length}`, inline: true }
            )
            .setDescription(`**שמות:**\n${result.kicked.join(', ') || 'אין'}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
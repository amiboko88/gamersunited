// 📁 handlers/users/dashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userManager = require('./manager');
const { log } = require('../../utils/logger');

class DashboardHandler {

    async showMainDashboard(interaction) {
        try {
            const guild = interaction.guild;
            const stats = await userManager.getInactivityStats(guild);
            
            if (!stats) return interaction.editReply('❌ נתונים חסרים.');

            // --- תצורה לתמונה אינפוגרפית מלאה ---
            // הרעיון: תמונה אחת שמכילה הכל.
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['פעילים', 'חשודים', 'רדומים', 'מתים (לניקוי)'],
                    datasets: [{
                        data: [stats.active, stats.review.length, stats.sleeping.length, stats.dead.length],
                        backgroundColor: ['#4CAF50', '#FF9800', '#9E9E9E', '#F44336'],
                        borderColor: '#1e1e1e',
                        borderWidth: 4
                    }]
                },
                options: {
                    rotation: -1.57, // מתחיל מלמעלה
                    circumference: 6.28,
                    legend: {
                        display: true,
                        position: 'right',
                        align: 'center',
                        labels: {
                            fontColor: 'white',
                            fontSize: 18,
                            padding: 20,
                            boxWidth: 20,
                            generateLabels: (chart) => {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: `${label}: ${data.datasets[0].data[i]}`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                }));
                            }
                        }
                    },
                    plugins: {
                        datalabels: { display: false }, // לא צריך על הגרף עצמו
                        doughnutlabel: {
                            labels: [
                                { text: `${stats.humans}`, font: { size: 30, color: 'white', weight: 'bold' } },
                                { text: 'חברים', font: { size: 16, color: '#cccccc' } }
                            ]
                        }
                    }
                }
            };

            // URL רחב וגדול
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=%231e1e1e&width=700&height=350`;

            const embed = new EmbedBuilder()
                .setColor('#1e1e1e')
                .setTitle(`🚀 דשבורד קהילה: ${guild.name}`)
                .setImage(chartUrl)
                .setFooter({ 
                    text: `🎙️ בקול: ${stats.voiceNow} | 🌱 חדשים: ${stats.newMembers} | עודכן: ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
                    iconURL: guild.iconURL()
                });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_manage_refresh')
                    .setLabel('רענן')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄'),
                
                // כפתור אדום רק אם יש "מתים"
                new ButtonBuilder()
                    .setCustomId('btn_manage_kick_prep')
                    .setLabel(`ניקוי מתים (${stats.kickCandidates.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.kickCandidates.length === 0)
                    .setEmoji('💀')
            );

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
            }

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            try { if (!interaction.replied) await interaction.editReply('❌ שגיאה בטעינת הנתונים.'); } catch (e) {}
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates; // מכיל רק DEAD

        if (candidates.length === 0) {
            return interaction.editReply('✅ אין משתמשים "מתים" (מעל 6 חודשים).');
        }

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`💀 ניקוי בית קברות (${candidates.length})`)
            .setDescription(`המשתמשים הבאים לא נראו מעל חצי שנה:\n\n${listText.slice(0, 3000)}`)
            .setColor('Red')
            .setFooter({ text: 'אישור יסיר אותם מהשרת לצמיתות.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_manage_kick_confirm')
                .setLabel('🚨 אשר מחיקה')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('btn_manage_cancel')
                .setLabel('ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    async executeKick(interaction) {
        await interaction.update({ content: '🚀 מנקה...', components: [], embeds: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 סיכום ניקוי')
            .setColor('Green')
            .setDescription(`🗑️ **הוסרו:** ${result.kicked.length}\n❌ **נכשלו:** ${result.failed.length}\n\n${result.kicked.join(', ')}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
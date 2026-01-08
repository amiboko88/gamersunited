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
                return interaction.editReply('❌ שגיאה בטעינת נתונים (נסה שוב בעוד דקה).');
            }

            // --- גרף QuickChart (Donut) ---
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['פעילים', 'חסינים', 'רדומים', 'בסיכון', 'להרחקה'],
                    datasets: [{
                        data: [stats.active, stats.immune, stats.inactive7.length, stats.inactive14.length, stats.inactive30.length],
                        backgroundColor: ['#4CAF50', '#2196F3', '#FFC107', '#FF9800', '#F44336'],
                        borderColor: '#1e1e1e',
                        borderWidth: 3
                    }]
                },
                options: {
                    legend: { display: true, position: 'right', labels: { fontColor: '#ffffff', fontSize: 14 } },
                    plugins: {
                        datalabels: { display: true, color: 'white', font: { weight: 'bold', size: 16 } },
                        doughnutlabel: {
                            labels: [
                                { text: `${stats.humans}`, font: { size: 24, color: 'white' } },
                                { text: 'חברים', font: { size: 14, color: '#cccccc' } }
                            ]
                        }
                    }
                }
            };
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=%231e1e1e&width=500&height=300`;

            // --- בניית טקסט ל-TOP 3 ---
            const topUsersText = stats.topActive.length > 0 
                ? stats.topActive.map((u, i) => `${['🥇','🥈','🥉'][i]} **${u.name}**`).join('\n')
                : 'אין מספיק נתונים';

            // --- בניית ה-Embed העשיר ---
            const embed = new EmbedBuilder()
                .setColor('#1e1e1e')
                .setTitle(`🚀 דשבורד קהילה: ${guild.name}`)
                .setDescription(`ניתוח פעילות בזמן אמת.\nסה"כ משתמשים: **${stats.total}**`)
                .setImage(chartUrl)
                .addFields(
                    { name: '🏆 המובילים השבוע', value: topUsersText, inline: true },
                    { name: '🎙️ סטטוס קולי', value: `**${stats.voiceNow}** משתמשים מחוברים כרגע`, inline: true },
                    { name: '🌱 צמיחה', value: `**${stats.newMembers}** הצטרפו ב-3 ימים האחרונים`, inline: true }
                )
                .setFooter({ 
                    text: `עודכן: ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })} • שמעון AI`,
                    iconURL: guild.iconURL()
                });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_manage_refresh')
                    .setLabel('רענן')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄'),
                
                new ButtonBuilder()
                    .setCustomId('btn_manage_kick_prep')
                    .setLabel(`ניקוי (${stats.inactive30.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.inactive30.length === 0)
                    .setEmoji('🗑️')
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
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) {
            return interaction.editReply('✅ השרת נקי! אין מועמדים להרחקה.');
        }

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ בדיקת הרחקה (${candidates.length} משתמשים)`)
            .setDescription(`רשימת מועמדים להרחקה (30+ יום ללא פעילות):\n\n${listText.slice(0, 3000)}`)
            .setColor('Red')
            .setFooter({ text: 'פעולה זו היא סופית.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_manage_kick_confirm')
                .setLabel('🚨 בצע הרחקה')
                .setStyle(ButtonStyle.Danger),
            
            new ButtonBuilder()
                .setCustomId('btn_manage_cancel')
                .setLabel('ביטול')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    async executeKick(interaction) {
        await interaction.update({ content: '🚀 שמעון מנקה את השרת...', components: [], embeds: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 סיכום פעולה')
            .setColor('Green')
            .addFields(
                { name: 'הורחקו', value: `${result.kicked.length}`, inline: true },
                { name: 'נכשלו/מוגנים', value: `${result.failed.length}`, inline: true }
            )
            .setDescription(`**טופלו:** ${result.kicked.join(', ') || 'אף אחד'}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
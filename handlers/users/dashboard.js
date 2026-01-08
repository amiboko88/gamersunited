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

            // קונפיגורציה לגרף עשיר וברור
            const chartConfig = {
                type: 'doughnut',
                data: {
                    labels: ['פעילים', 'חסינים', 'רדומים (7+)', 'בסיכון (14+)', 'להרחקה (30+)'],
                    datasets: [{
                        data: [
                            stats.active, 
                            stats.immune, 
                            stats.inactive7.length, 
                            stats.inactive14.length, 
                            stats.inactive30.length
                        ],
                        backgroundColor: [
                            '#4CAF50', // ירוק - פעיל
                            '#2196F3', // כחול - חסין
                            '#FFC107', // צהוב - רדום
                            '#FF9800', // כתום - סיכון
                            '#F44336'  // אדום - הרחקה
                        ],
                        borderColor: '#1e1e1e',
                        borderWidth: 3
                    }]
                },
                options: {
                    // הופך את הגרף לברור יותר עם מקרא בצד
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            fontColor: '#ffffff',
                            fontSize: 16,
                            padding: 15,
                            boxWidth: 20
                        }
                    },
                    plugins: {
                        // הצגת מספרים על הגרף עצמו
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            font: { weight: 'bold', size: 20 },
                            anchor: 'center',
                            align: 'center'
                        },
                        doughnutlabel: {
                            labels: [
                                { text: `${stats.humans}`, font: { size: 30, color: '#ffffff' } },
                                { text: 'חברים', font: { size: 16, color: '#cccccc' } }
                            ]
                        }
                    }
                }
            };
            
            // שימוש ב-plugin להצגת תוויות מספרים (datalabels)
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=%231e1e1e&width=600&height=350`;

            const embed = new EmbedBuilder()
                .setColor('#1e1e1e')
                .setTitle(`📊 דשבורד קהילה: ${guild.name}`)
                .setDescription(`ניתוח עומק בזמן אמת.\nסה"כ בשרת: **${stats.total}** | בני אנוש: **${stats.humans}**`)
                .setImage(chartUrl)
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

            // בדיקה אם זו הודעה חדשה או עדכון
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 }); // Ephemeral
            }

        } catch (error) {
            log(`Dashboard Error: ${error.message}`);
            try { 
                if (!interaction.replied) await interaction.editReply('❌ שגיאה בטעינת הגרף.');
            } catch (e) {}
        }
    }

    async showKickCandidateList(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const stats = await userManager.getInactivityStats(interaction.guild);
        const candidates = stats.kickCandidates;

        if (candidates.length === 0) {
            return interaction.editReply('✅ הרשימה ריקה! הקהילה בריאה.');
        }

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ בדיקת הרחקה (${candidates.length} משתמשים)`)
            .setDescription(`המשתמשים הבאים לא נראו בדיסקורד, בוואטסאפ או במשחקים מעל 30 יום:\n\n${listText.slice(0, 3000)}`)
            .setColor('Red')
            .setFooter({ text: 'לחץ על "בצע הרחקה" רק אם אתה בטוח.' });

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
        await interaction.update({ content: '🚀 שמעון מנקה את השרת... נא להמתין.', components: [], embeds: [] });
        
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
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
                return interaction.editReply('❌ נתונים חסרים (נסה שוב).');
            }

            // --- גרף QuickChart (Donut) ---
            const chartConfig = {
                type: 'doughnut',
                data: {
                    // תוויות מעודכנות
                    labels: [
                        'פעילים', 
                        'חסינים', 
                        'לבדיקה (חשודים)', 
                        'רדומים (ללא עבר)', 
                        'מתים (6 חודשים+)'
                    ],
                    datasets: [{
                        data: [
                            stats.active, 
                            stats.immune, 
                            stats.review.length, 
                            stats.sleeping.length, 
                            stats.dead.length
                        ],
                        backgroundColor: [
                            '#4CAF50', // ירוק
                            '#2196F3', // כחול
                            '#FF9800', // כתום (חשודים)
                            '#9E9E9E', // אפור (רדומים)
                            '#F44336'  // אדום (מתים)
                        ],
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
            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=%231e1e1e&width=550&height=300`;

            // --- Embed נקי בלי מובילים ---
            const embed = new EmbedBuilder()
                .setColor('#1e1e1e')
                .setTitle(`📊 דשבורד קהילה: ${guild.name}`)
                .setDescription(`ניתוח עומק לוגי.\nסה"כ משתמשים: **${stats.total}**`)
                .setImage(chartUrl)
                .addFields(
                    { name: '💀 מתים (להרחקה)', value: `**${stats.dead.length}** (חצי שנה+)`, inline: true },
                    { name: '🕵️ לבדיקה ידנית', value: `**${stats.review.length}** (לא פעילים עם עבר)`, inline: true },
                    { name: '💤 רדומים (ללא עבר)', value: `**${stats.sleeping.length}** (3 חודשים+)`, inline: true },
                    { name: '👻 AFK טריים', value: `**${stats.afk.length}** (נכנסו ויצאו)`, inline: true },
                    { name: '🎙️ קול', value: `**${stats.voiceNow}** מחוברים`, inline: true },
                    { name: '🌱 חדשים', value: `**${stats.newMembers}** השבוע`, inline: true }
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
                    .setLabel(`ניקוי (${stats.kickCandidates.length})`) // מנקה רק מתים ורדומים
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(stats.kickCandidates.length === 0)
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
            return interaction.editReply('✅ אין מועמדים להרחקה (מתים/רדומים).');
        }

        const listText = candidates.map(c => `• **${c.name}** (<@${c.userId}>) - ${c.days} ימים`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ מועמדים להרחקה (${candidates.length})`)
            .setDescription(`המשתמשים הבאים הם "מתים" (180+ יום) או "רדומים ללא היסטוריה" (90+ יום):\n\n${listText.slice(0, 3000)}`)
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
        await interaction.update({ content: '🚀 שמעון מנקה את השרת...', components: [], embeds: [] });
        
        const stats = await userManager.getInactivityStats(interaction.guild);
        const userIds = stats.kickCandidates.map(c => c.userId);

        const result = await userManager.executeKickBatch(interaction.guild, userIds);

        const summaryEmbed = new EmbedBuilder()
            .setTitle('🧹 סיכום פעולה')
            .setColor('Green')
            .addFields(
                { name: 'הורחקו', value: `${result.kicked.length}`, inline: true },
                { name: 'נכשלו', value: `${result.failed.length}`, inline: true }
            )
            .setDescription(`**טופלו:** ${result.kicked.join(', ') || 'אף אחד'}`);

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }
}

module.exports = new DashboardHandler();
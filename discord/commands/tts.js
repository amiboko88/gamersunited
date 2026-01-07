
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mediaStats = require('../../handlers/media/stats'); // ✅ החיבור החדש
const { log } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('תווים')
        .setDescription('📊 מציג דוח שימוש במנועי הדיבור (TTS)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        log(`[SLASH] דוח תווים נדרש ע"י ${interaction.user.tag}`);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const stats = await mediaStats.getTTSUsageReport();
            
            if (!stats) {
                return interaction.editReply('📭 לא נמצאו נתוני שימוש במערכת.');
            }

            // עיבוד הנתונים לתצוגה (Top 5)
            const topUsers = Object.entries(stats.userUsage)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name, count], i) => `**${i + 1}.** ${name}: \`${count.toLocaleString()}\` תווים`)
                .join('\n') || 'אין נתונים';

            const topProfiles = Object.entries(stats.profileUsage)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([name, count]) => `**-** \`${name}\`: ${count.toLocaleString()} שימושים`)
                .join('\n') || 'אין נתונים';

            const embed = new EmbedBuilder()
                .setColor('#4285F4') // Google Blue / ElevenLabs Style
                .setTitle('📊 דוח שימוש: מנוע TTS')
                .setThumbnail('https://i.imgur.com/P4Un12C.png')
                .addFields(
                    { name: '📈 סה"כ (כל הזמנים)', value: `\`${stats.totalCharsAllTime.toLocaleString()}\` תווים`, inline: false },
                    { name: '📅 חודשי', value: `\`${stats.totalCharsMonth.toLocaleString()}\` תווים`, inline: true },
                    { name: '☀️ יומי', value: `\`${stats.totalCharsToday.toLocaleString()}\` תווים`, inline: true },
                    { name: '\u200B', value: '\u200B' }, // מרווח
                    { name: '🏆 המשתמשים הכבדים', value: topUsers, inline: false },
                    { name: '🎤 קולות פופולריים', value: topProfiles, inline: false }
                )
                .setFooter({ text: 'נתונים מתוך DB מאוחד • Shimon AI' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            log(`❌ [SLASH] שגיאה בדוח תווים: ${error.message}`);
            await interaction.editReply('❌ אירעה שגיאה בשליפת הנתונים.');
        }
    }
};
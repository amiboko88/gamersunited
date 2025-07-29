// 📁 commands/tts.js

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getTTSUsageData } = require('../tts/ttsQuotaManager.eleven.js');
const { log } = require('../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('תווים')
        .setDescription('📊 מציג דוח שימוש מפורט במנוע ה-TTS של גוגל.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // --- ✅ שימוש בלוג שהיה חסר ---
        log(`[SLASH] התקבלה בקשה לדוח תווים מ-${interaction.user.tag}.`);

        await interaction.deferReply({ ephemeral: true });
        
        try {
            const usageData = await getTTSUsageData();
            if (usageData === null || usageData.length === 0) {
                return interaction.editReply('לא נמצאו נתוני שימוש.');
            }

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            let totalCharsAllTime = 0;
            let totalCharsMonth = 0;
            let totalCharsToday = 0;
            const userUsage = {};
            const profileUsage = {};

            usageData.forEach(data => {
                if (!data.timestamp || !data.timestamp.toDate) return;

                const timestamp = data.timestamp.toDate();
                const charCount = data.characterCount || 0;

                totalCharsAllTime += charCount;
                if (timestamp >= startOfMonth) totalCharsMonth += charCount;
                if (timestamp >= startOfDay) totalCharsToday += charCount;
                
                userUsage[data.username] = (userUsage[data.username] || 0) + charCount;
                if (data.voiceProfile) {
                    profileUsage[data.voiceProfile] = (profileUsage[data.voiceProfile] || 0) + 1;
                }
            });
            
            const topUsers = Object.entries(userUsage)
                .sort(([, a], [, b]) => b - a).slice(0, 5)
                .map(([name, count], i) => `**${i + 1}.** ${name}: \`${count.toLocaleString()}\` תווים`).join('\n') || 'אין נתונים';

            const topProfiles = Object.entries(profileUsage)
                .sort(([, a], [, b]) => b - a).slice(0, 3)
                .map(([name, count]) => `**-** \`${name}\`: ${count.toLocaleString()} שימושים`).join('\n') || 'אין נתונים';

            const embed = new EmbedBuilder()
                .setColor('#4285F4')
                .setTitle('📊 דוח שימוש במנוע Google TTS')
                .setThumbnail('https://i.imgur.com/P4Un12C.png')
                .addFields(
                    { name: '📈 סה"כ שימוש (כל הזמנים)', value: `\`${totalCharsAllTime.toLocaleString()}\` תווים`, inline: false },
                    { name: '📅 שימוש החודש', value: `\`${totalCharsMonth.toLocaleString()}\` תווים`, inline: true },
                    { name: '☀️ שימוש היום', value: `\`${totalCharsToday.toLocaleString()}\` תווים`, inline: true },
                    { name: '\u200B', value: '\u200B' },
                    { name: '👥 חמשת המשתמשים המובילים', value: topUsers, inline: false },
                    { name: '🎤 הפרופילים הפופולריים', value: topProfiles, inline: false }
                )
                .setFooter({ text: 'הנתונים מתעדכנים בזמן אמת' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // --- ✅ שימוש בלוג שהיה חסר ---
            log.error('❌ [SLASH] שגיאה ביצירת דוח תווים:', error);
            await interaction.editReply('אירעה שגיאה בעת שליפת הנתונים.');
        }
    }
};
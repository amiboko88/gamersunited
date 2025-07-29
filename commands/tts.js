// 📁 commands/tts.js (עם הנתיב המתוקן)

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');
// --- ✨ התיקון נמצא כאן ---
const { USAGE_COLLECTION } = require('../handlers/tts/ttsQuotaManager.eleven.js');
const { log } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('תווים')
        .setDescription('📊 מציג דוח שימוש במנוע ה-TTS של גוגל.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();
        log(`[SLASH] התקבלה בקשה לדוח תווים מ-${interaction.user.tag}.`);

        try {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            // --- שימוש בנתיב הנכון לקולקציה ---
            const snapshot = await db.collection(USAGE_COLLECTION).get();
            if (snapshot.empty) {
                return interaction.editReply('לא נמצאו נתוני שימוש.');
            }

            let totalCharsAllTime = 0;
            let totalCharsMonth = 0;
            let totalCharsToday = 0;
            const userUsage = {};
            const profileUsage = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const timestamp = data.timestamp.toDate();

                totalCharsAllTime += data.characterCount;

                if (timestamp >= startOfMonth) totalCharsMonth += data.characterCount;
                if (timestamp >= startOfDay) totalCharsToday += data.characterCount;
                
                userUsage[data.username] = (userUsage[data.username] || 0) + data.characterCount;
                profileUsage[data.voiceProfile] = (profileUsage[data.voiceProfile] || 0) + 1;
            });
            
            const topUsers = Object.entries(userUsage)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name, count], i) => `**${i + 1}.** ${name}: \`${count.toLocaleString()}\` תווים`)
                .join('\n') || 'אין נתונים';

            const topProfiles = Object.entries(profileUsage)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([name, count]) => `**-** \`${name}\`: ${count} שימושים`)
                .join('\n') || 'אין נתונים';

            const embed = new EmbedBuilder()
                .setColor('#4285F4')
                .setTitle('📊 דוח שימוש במנוע Google TTS')
                .setThumbnail('https://i.imgur.com/P4Un12C.png')
                .addFields(
                    { name: '📈 סה"כ שימוש (כל הזמנים)', value: `\`${totalCharsAllTime.toLocaleString()}\` תווים`, inline: false },
                    { name: '📅 שימוש החודש', value: `\`${totalCharsMonth.toLocaleString()}\` תווים`, inline: true },
                    { name: '☀️ שימוש היום', value: `\`${totalCharsToday.toLocaleString()}\` תווים`, inline: true },
                    { name: '👥 חמשת המשתמשים המובילים', value: topUsers, inline: false },
                    { name: '🎤 הפרופילים הפופולריים', value: topProfiles, inline: false }
                )
                .setFooter({ text: 'הנתונים מתעדכנים בזמן אמת' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            log.error('❌ שגיאה ביצירת דוח תווים:', error);
            await interaction.editReply('אירעה שגיאה בעת שליפת הנתונים.');
        }
    }
};
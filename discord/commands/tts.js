// 📁 discord/commands/tts.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('📊 דוח שימוש אישי ב-AI (צריכת תווים ועלויות)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const userId = interaction.user.id;
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.data() || {};

            // שליפת הנתון המדויק מהמיקום החדש
            const charsUsed = userData.stats?.aiCharsUsed || 0;

            // --- לוגיקת הדרגות ---
            let rank = "אזרח תמים 😇";
            let color = "#00FF00"; // ירוק
            let limit = 2000; // יעד ראשון

            if (charsUsed > 50000) {
                rank = "💀 אויב האנושות (ויקר לכיס)";
                color = "#FF0000"; // אדום בוהק
                limit = 100000;
            } else if (charsUsed > 10000) {
                rank = "🤖 מכור ל-AI";
                color = "#FF8C00"; // כתום
                limit = 50000;
            } else if (charsUsed > 2000) {
                rank = "🗣️ חופר מתחיל";
                color = "#FFFF00"; // צהוב
                limit = 10000;
            }

            // --- חישוב עלות משוערת (לפי תעריף GPT-4o ממוצע) ---
            // נניח ש-1000 תווים הם בערך 0.03 דולר (כולל קלט/פלט)
            const estimatedCost = (charsUsed / 1000) * 0.03;

            // --- יצירת בר התקדמות ---
            const percentage = Math.min((charsUsed / limit) * 100, 100);
            const progressBlocks = Math.floor(percentage / 10); // 10 בלוקים סה"כ
            const progressBar = '█'.repeat(progressBlocks) + '░'.repeat(10 - progressBlocks);

            const embed = new EmbedBuilder()
                .setTitle(`📊 דוח צריכת AI: ${interaction.user.username}`)
                .setColor(color)
                .addFields(
                    { name: '💬 סה"כ תווים שנצרכו', value: `**${charsUsed.toLocaleString()}** תווים`, inline: true },
                    { name: '🏷️ דירוג התמכרות', value: `**${rank}**`, inline: true },
                    { name: '💰 עלות משוערת לשמעון', value: `$${estimatedCost.toFixed(3)}`, inline: true },
                    { name: `📈 התקדמות ליעד הבא (${limit.toLocaleString()})`, value: `\`[${progressBar}] ${percentage.toFixed(1)}%\``, inline: false }
                )
                .setFooter({ text: 'הנתונים כוללים שיחות טקסט, TTS וניתוח תמונות.', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ שגיאה בשליפת דוח השימוש.');
        }
    }
};
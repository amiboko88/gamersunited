// 📁 discord/commands/leaderboard.js
const { SlashCommandBuilder } = require('discord.js');
const rankingCore = require('../../handlers/ranking/core');
const graphics = require('../../handlers/graphics/index'); // ✅ תיקון: חיבור למנוע הגרפי החדש
const { log } = require('../../utils/logger');

function getWeekNumber() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏆 צפייה בטבלת האלופים הנוכחית (סטטוס חי)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            let isFallback = false;
            // נסיון 1: נתונים שבועיים (Top 5 Only)
            let leaders = await rankingCore.getWeeklyLeaderboard(5, false);

            // נסיון 2: נתוני כל הזמנים (אם ריק)
            if (!leaders || leaders.length === 0) {
                leaders = await rankingCore.getWeeklyLeaderboard(5, true);
                isFallback = true;
            }

            if (!leaders || leaders.length === 0) {
                return interaction.editReply('❌ אין מספיק נתונים פעילים השבוע ליצירת טבלה.');
            }

            // ✅ העשרת נתונים: שליפת תמונות עדכניות מהשרת
            for (const p of leaders) {
                try {
                    const member = await interaction.guild.members.fetch(p.id).catch(() => null);
                    if (member) {
                        p.avatar = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                        p.name = member.displayName; // עדכון שם לשם הנוכחי בשרת
                    }
                } catch (e) {
                    console.error(`Failed to fetch avatar for ${p.id}`);
                }
            }

            const weekNum = getWeekNumber();

            // ✅ קריאה לפונקציה החדשה
            const imageBuffer = await graphics.leaderboard.generateImage(leaders, weekNum);

            if (!imageBuffer) {
                return interaction.editReply('❌ שגיאה בייצור תמונת הדירוג.');
            }

            const footerText = isFallback ?
                "\n⚠️ **שים לב:** הטבלה מציגה נתונים מצטברים כי טרם נצברה פעילות השבוע." : "";

            await interaction.editReply({
                content: `📊 **טבלת האלופים - שבוע ${weekNum} (מצב נוכחי)**${footerText}`,
                files: [{ attachment: imageBuffer, name: `leaderboard_preview_w${weekNum}.png` }]
            });

            log(`👤 [Leaderboard] תצוגה מקדימה נשלחה ל-${interaction.user.tag}`);

        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await interaction.editReply('❌ שגיאה בהפקת הטבלה.');
        }
    }
};
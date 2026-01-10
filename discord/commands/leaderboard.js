// 📁 discord/commands/leaderboard.js
const { SlashCommandBuilder } = require('discord.js');
const rankingCore = require('../../handlers/ranking/core');
const rankingRenderer = require('../../handlers/ranking/render');
const { log } = require('../../utils/logger');

/**
 * חישוב מספר שבוע נוכחי
 */
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
        // התשובה תמיד אישית למשתמש - לא מציף את הערוץ
        await interaction.deferReply({ ephemeral: true });

        try {
            // 1. שליפת נתוני זמן אמת מה-DB
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
            if (!leaders || leaders.length === 0) {
                return interaction.editReply('❌ אין מספיק נתונים פעילים השבוע ליצירת טבלה.');
            }

            const weekNum = getWeekNumber();

            // 2. יצירת התמונה (Puppeteer)
            const imageBuffer = await rankingRenderer.generateLeaderboardImage(leaders, weekNum);

            if (!imageBuffer) {
                return interaction.editReply('❌ שגיאה בייצור תמונת הדירוג. נסה שוב מאוחר יותר.');
            }

            // 3. הצגת התוצאה למשתמש
            await interaction.editReply({
                content: `📊 **טבלת האלופים - שבוע ${weekNum} (מצב נוכחי)**\nהנתונים מתעדכנים כל הזמן. הטבלה הרשמית תפורסם במוצ"ש ב-20:00.`,
                files: [{ attachment: imageBuffer, name: `leaderboard_preview_w${weekNum}.png` }]
            });

            log(`👤 [Leaderboard] תצוגה מקדימה נשלחה ל-${interaction.user.tag}`);

        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await interaction.editReply('❌ שגיאה בהפקת הטבלה.');
        }
    }
};
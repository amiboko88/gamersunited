// 📁 discord/commands/leaderboard.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const rankingCore = require('../../handlers/ranking/core');
const rankingRenderer = require('../../handlers/ranking/render');
const rankingBroadcaster = require('../../handlers/ranking/broadcaster');
const { getWeekNumber } = require('../../whatsapp/utils/timeHandler'); // שימוש בפונקציה הקיימת

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard') 
        .setDescription('🏆 מפיק ושולח את טבלת האלופים (וואטסאפ/דיסקורד/טלגרם)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (interaction.replied || interaction.deferred) return; 
        
        await interaction.deferReply({ ephemeral: true });

        try {
            // 1. שליפת נתונים
            const leaders = await rankingCore.getWeeklyLeaderboard(5);
            if (!leaders || leaders.length === 0) {
                return interaction.editReply('❌ אין נתונים לשבוע הזה עדיין.');
            }

            // 2. יצירת תמונה
            // אם הפונקציה getWeekNumber לא זמינה כאן, נשתמש בחישוב מקומי
            let weekNum;
            try {
                weekNum = getWeekNumber();
            } catch (e) {
                const currentDate = new Date();
                const startDate = new Date(currentDate.getFullYear(), 0, 1);
                const days = Math.floor((currentDate - startDate) / (24 * 60 * 60 * 1000));
                weekNum = Math.ceil(days / 7);
            }

            const imageBuffer = await rankingRenderer.generateLeaderboardImage(leaders, weekNum);

            // 3. יצירת טקסט
            const mvp = leaders[0];
            const caption = `👑 **אלופי השבוע #${weekNum}** 👑\n\n` +
                            `🥇 **MVP:** ${mvp.name} (דפק עבודה!)\n` +
                            `🔥 **סה"כ פעילות:** ${leaders.length} לוחמים בדירוג.\n\n` +
                            `👇 לוח התוצאות המלא בתמונה 👇`;

            // 4. הפצה לכולם
            if (rankingBroadcaster && typeof rankingBroadcaster.broadcastAll === 'function') {
                await rankingBroadcaster.broadcastAll(imageBuffer, caption, interaction.client);
                await interaction.editReply('✅ הטבלה הופצה בהצלחה לכל הפלטפורמות!');
            } else {
                await interaction.editReply({ 
                    content: '✅ הטבלה הופקה (מצב מקומי):', 
                    files: [{ attachment: imageBuffer, name: 'leaderboard.png' }] 
                });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ שגיאה בהפקת הטבלה.');
        }
    }
};
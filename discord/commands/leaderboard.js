// 📁 discord/commands/leaderboard.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const rankingCore = require('../../handlers/ranking/core');
const rankingRenderer = require('../../handlers/ranking/render');
const rankingBroadcaster = require('../../handlers/ranking/broadcaster');

// פונקציית עזר למספר שבוע
function getWeekNumber() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard') 
        .setDescription('🏆 הפקת טבלת האלופים (תמונה איכותית)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // 1. חישוב נתונים
            const leaders = await rankingCore.getWeeklyLeaderboard(10); // טופ 10
            if (!leaders || leaders.length === 0) {
                return interaction.editReply('❌ אין מספיק נתונים פעילים השבוע.');
            }

            const weekNum = getWeekNumber();

            // 2. יצירת תמונה (Puppeteer)
            const imageBuffer = await rankingRenderer.generateLeaderboardImage(leaders, weekNum);

            // 3. הפצה (אם הוגדר)
            // כדי לבדוק קודם לבד, אנחנו לא מפיצים אוטומטית אלא שולחים למנהל שהריץ את הפקודה
            
            // שליחה פרטית למנהל לבדיקה
            await interaction.editReply({ 
                content: '✅ הטבלה הופקה בהצלחה! (תצוגה מקדימה)', 
                files: [{ attachment: imageBuffer, name: 'leaderboard.png' }] 
            });

            // אם אתה רוצה הפצה אוטומטית בלחיצת כפתור, זה ידרוש עוד שלב, 
            // אבל כרגע הפקודה מציגה לך את התוצאה.
            
            // אופציונלי: הפצה לכולם (אם תרצה לפתוח את ההערה)
            /*
            const clients = {
                discord: interaction.client,
                whatsapp: interaction.client.whatsappSock, // דורש גישה
                telegram: interaction.client.telegramBot,
                waGroupId: process.env.WHATSAPP_GROUP_ID
            };
            await rankingBroadcaster.broadcastAll(imageBuffer, weekNum, clients);
            */

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ שגיאה בהפקת הטבלה.');
        }
    }
};
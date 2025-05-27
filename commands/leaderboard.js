// 📁 commands/leaderboard.js

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sendLeaderboardEmbed } = require('../handlers/leaderboardDisplay');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('לוח_פעילות')
    .setDescription('🏆 מציג את לוח הפעילות השבועי של הקהילה')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ✅ למנהלים בלבד

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const success = await sendLeaderboardEmbed(interaction.client);

      if (success) {
        await interaction.editReply('✅ לוח הפעילות נשלח בהצלחה לערוץ הפעילות!');
        console.log(`🟢 Slash /לוח_פעילות הופעל ע"י ${interaction.user.tag}`);
      } else {
        await interaction.editReply('⚠️ אין מספיק נתונים השבוע ליצירת לוח פעילות.');
        console.log(`ℹ️ Slash /לוח_פעילות הופעל – אך אין משתמשים פעילים להצגה.`);
      }

    } catch (err) {
      console.error('❌ שגיאה בעת ביצוע /לוח_פעילות:', err);
      await interaction.editReply('❌ אירעה שגיאה בשליחת לוח הפעילות. ראה לוג לפרטים.');
    }
  }
};

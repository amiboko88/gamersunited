const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendLeaderboardEmbed } = require('../handlers/leaderboardDisplay');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('לוח_פעילות')
    .setDescription('🏆 מציג את לוח הפעילות השבועי של הקהילה')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ✅ מנהלים בלבד

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      await sendLeaderboardEmbed(interaction.client);
      await interaction.editReply('✅ לוח הפעילות נשלח בהצלחה לערוץ המיועד.');
    } catch (err) {
      console.error('❌ שגיאה בשליחת לוח פעילות:', err);
      await interaction.editReply('⚠️ שגיאה בשליחת לוח הפעילות. ראה לוג.');
    }
  }
};

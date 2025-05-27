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

      const sent = await sendLeaderboardEmbed(interaction.client);

      if (sent) {
        await interaction.editReply('✅ לוח הפעילות נשלח בהצלחה לערוץ המיועד.');
      } else {
        await interaction.editReply('⚠️ לוח הפעילות לא נשלח – ייתכן שאין נתונים או בעיה בקובץ.');
      }
    } catch (err) {
      console.error('❌ שגיאה בשליחת לוח פעילות:', err);
      await interaction.editReply('❌ שגיאה בשליחת לוח הפעילות. בדוק את הלוג.');
    }
  }
};

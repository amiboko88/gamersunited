const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setupRulesMessage } = require('../handlers/rulesEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עדכן_חוקים')
    .setDescription('🔁 מרענן את הודעת חוקי הקהילה (רק למנהלים)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ✅ מגביל למנהלים

  async execute(interaction) {
    try {
      await setupRulesMessage(interaction.client);
      await interaction.reply({
        content: '✅ הודעת החוקים עודכנה בהצלחה!',
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ שגיאה בהרצת עדכון חוקי הקהילה:', err);
      await interaction.reply({
        content: '⚠️ שגיאה בעדכון הודעת החוקים. ראה לוג.',
        ephemeral: true
      });
    }
  }
};

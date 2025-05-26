const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setupRulesMessage } = require('../handlers/rulesEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עדכן_חוקים')
    .setDescription('🔁 מרענן את הודעת חוקי הקהילה (רק למנהלים)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ✅ מגביל למנהלים

  async execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true }); // ✅ שומר את האינטראקציה פתוחה
    await setupRulesMessage(interaction.client);
    await interaction.editReply({
      content: '✅ הודעת החוקים עודכנה בהצלחה!'
    });
  } catch (err) {
    console.error('❌ שגיאה בהרצת עדכון חוקי הקהילה:', err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '⚠️ שגיאה בעדכון הודעת החוקים. ראה לוג.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: '⚠️ שגיאה בעדכון הודעת החוקים. ראה לוג.'
      });
    }
  }
}

};

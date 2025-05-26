const { SlashCommandBuilder } = require('discord.js');
const { setupRulesMessage } = require('../handlers/rulesEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עדכן_חוקים')
    .setDescription('🔄 עדכון חוקי הקהילה והתמונה השבועית (למנהלים בלבד)'),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '⛔ הפקודה זמינה למנהלים בלבד.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await setupRulesMessage(interaction.client);
      await interaction.editReply('✅ הודעת החוקים עודכנה בהצלחה.');
    } catch (err) {
      console.error('❌ שגיאה בעדכון חוקי הקהילה:', err);
      await interaction.editReply('❌ שגיאה בעדכון חוקי הקהילה. בדוק את הלוגים.');
    }
  }
};

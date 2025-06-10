const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const generateHelpImage = require('../handlers/generateHelpImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('מרכז עזרה אינטראקטיבי'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const imagePath = await generateHelpImage();
      const file = new AttachmentBuilder(imagePath);

      await interaction.editReply({
        content: '📘 הנה מרכז העזרה שלך:',
        files: [file],
        ephemeral: true
      });
    } catch (err) {
      console.error('שגיאה ביצירת תמונת עזרה:', err);
      await interaction.editReply({
        content: '❌ שמעון הסתבך עם הקובץ... נסה שוב בעוד רגע.',
        ephemeral: true
      });
    }
  }
};

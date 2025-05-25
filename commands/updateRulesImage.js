// 📁 commands/updateRulesImage.js
const { SlashCommandBuilder } = require('discord.js');
const { generateRulesImage } = require('../utils/generateRulesImage');
const { setupRulesMessage } = require('../handlers/rulesEmbed');

const OWNER_ID = '1140188306806673469'; // ← שנה ל־user.id שלך

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עדכן_תמונה_חוקים')
    .setDescription('🎨 עדכון ידני של תמונת החוקים השבועית'),

  async execute(interaction, client) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '⛔ רק מנהל השרת יכול להשתמש בפקודה זו.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await generateRulesImage();
      await setupRulesMessage(client);
      await interaction.editReply('✅ התמונה החדשה נוצרה והחוקים עודכנו בהצלחה.');
    } catch (err) {
      console.error('❌ שגיאה בעדכון התמונה:', err);
      await interaction.editReply('❌ שגיאה בעדכון התמונה. בדוק את הלוגים.');
    }
  }
};

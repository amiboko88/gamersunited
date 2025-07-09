// 📁 interactions/buttons/help_buttons.js
const { handleButton: helpHandleButton } = require('../../commands/help');

module.exports = {
  // הפונקציה בודקת אם ה-ID מתחיל במחרוזת מסוימת
  customId: (interaction) => {
    const id = interaction.customId; // 💡 התיקון
    return id.startsWith('help_');
  },
  type: 'isButton', 
  async execute(interaction, client) {
    await helpHandleButton(interaction);
  }
};
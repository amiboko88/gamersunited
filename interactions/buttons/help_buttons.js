// 📁 interactions/buttons/help_buttons.js
const { handleButton: helpHandleButton } = require('../../commands/help');

module.exports = {
  // הפעם ה-customId הוא פונקציה שבודקת אם ה-ID מתחיל במחרוזת מסוימת
  customId: (id) => id.startsWith('help_'),
  // נוודא שזה כפתור ולא סוג אחר של אינטראקציה
  type: 'isButton', 
  async execute(interaction, client) {
    await helpHandleButton(interaction);
  }
};
// 📁 interactions/buttons/birthday_buttons.js
const handleBirthdayPanel = require('../../handlers/birthdayPanelHandler');

const birthdayButtonIds = [
  'bday_list',
  'bday_next',
  'bday_add',
  'bday_missing',
  'bday_remind_missing',
  'open_birthday_modal'
];

module.exports = {
  // הפונקציה בודקת אם ה-ID הוא אחד מכפתורי הפאנל
  customId: (interaction) => {
    const id = interaction.customId; // 💡 התיקון
    return birthdayButtonIds.includes(id);
  },
  type: 'isButton',
  
  async execute(interaction, client) {
    await handleBirthdayPanel(interaction);
  }
};
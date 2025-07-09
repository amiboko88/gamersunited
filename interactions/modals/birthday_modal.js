// 📁 interactions/modals/birthday_modal.js
const { handleBirthdayModalSubmit } = require('../../handlers/birthdayPanelHandler');

module.exports = {
  customId: 'birthday_modal',
  async execute(interaction, client) {
    // קריאה ישירה לפונקציה הממוקדת
    await handleBirthdayModalSubmit(interaction);
  }
};
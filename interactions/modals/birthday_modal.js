// 📁 interactions/modals/birthday_modal.js
const handleBirthdayPanel = require('../../handlers/birthdayPanelHandler');

module.exports = {
  customId: 'birthday_modal',
  async execute(interaction, client) {
    await handleBirthdayPanel(interaction);
  }
};
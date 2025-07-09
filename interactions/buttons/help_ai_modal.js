// 📁 interactions/modals/help_ai_modal.js
const { handleButton: helpHandleButton } = require('../../commands/help');

module.exports = {
  customId: 'help_ai_modal',
  // נוודא שזו שליחת מודאל
  type: 'isModalSubmit',
  async execute(interaction, client) {
    await helpHandleButton(interaction);
  }
};
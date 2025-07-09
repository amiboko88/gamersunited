// 📁 interactions/modals/dm_fallback_modal.js
const { handleDmFallbackModalSubmit } = require('../../handlers/dmFallbackModal');

module.exports = {
  customId: 'dm_fallback_modal',
  async execute(interaction, client) {
    await handleDmFallbackModalSubmit(interaction, client);
  }
};
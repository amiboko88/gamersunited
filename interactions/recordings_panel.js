// 📁 interactions/recordings_panel.js
const recordingsPanel = require('../commands/recordingsPanel');

module.exports = {
  // הפונקציה בודקת אם האינטראקציה שייכת לפאנל ההקלטות
  customId: (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_voice') {
      return true;
    }
    if (interaction.isButton() && ['play_voice_selected', 'delete_voice_selected'].includes(interaction.customId)) {
      return true;
    }
    return false;
  },

  async execute(interaction, client) {
    // הקובץ המקורי מפנה את כל האינטראקציות האלה לאותה פונקציה
    await recordingsPanel.handleInteraction(interaction, client);
  }
};
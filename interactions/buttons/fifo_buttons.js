// 📁 interactions/buttons/fifo_buttons.js
const { handleFifoButtons } = require('../../handlers/fifoButtonHandler');

module.exports = {
  customId: (interaction) => {
    const id = interaction.customId; // 💡 מושכים את ה-ID מתוך האובייקט
    return id.startsWith('replay_') || id.startsWith('reset_all_') || id === 'repartition_now';
  },
  type: 'isButton',
  async execute(interaction, client) {
    await handleFifoButtons(interaction, client);
  }
};
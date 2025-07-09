// 📁 interactions/buttons/fifo_buttons.js
const { handleFifoButtons } = require('../../handlers/fifoButtonHandler');

module.exports = {
  // הפונקציה בודקת אם ה-ID תואם לאחד מכפתורי ה-FIFO
  customId: (id) => {
    return id.startsWith('replay_') || id.startsWith('reset_all_') || id === 'repartition_now';
  },
  // הלוגיקה המקורית בודקת אם זה כפתור או תפריט, כאן נתמקד בכפתורים
  type: 'isButton',

  async execute(interaction, client) {
    await handleFifoButtons(interaction, client);
  }
};
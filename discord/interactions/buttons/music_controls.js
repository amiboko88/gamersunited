// 📁 interactions/buttons/music_controls.js
const handleMusicControls = require('../../handlers/musicControls');

const musicControlIds = ['pause', 'resume', 'stop'];

module.exports = {
  // הפונקציה בודקת אם ה-ID הוא אחד מכפתורי השליטה
  customId: (interaction) => {
    const id = interaction.customId; // 💡 התיקון
    return musicControlIds.includes(id);
  },
  type: 'isButton',
  
  async execute(interaction, client) {
    await handleMusicControls(interaction);
  }
};
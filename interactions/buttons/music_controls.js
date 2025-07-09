// 📁 interactions/buttons/music_controls.js
const handleMusicControls = require('../../handlers/musicControls');

// מערך של ה-IDs של כפתורי המוזיקה
const musicControlIds = ['pause', 'resume', 'stop'];

module.exports = {
  // הפונקציה בודקת אם ה-ID הוא אחד מכפתורי השליטה
  customId: (id) => musicControlIds.includes(id),
  type: 'isButton',

  async execute(interaction, client) {
    await handleMusicControls(interaction);
  }
};
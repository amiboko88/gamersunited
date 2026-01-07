// 📁 discord/interactions/buttons/music_controls.js
// ⚠️ וודא שהקובץ הזה קיים! אם לא, הכפתורים יכשלו.
// תיקנתי לנתיב ../../../ למקרה שהוא בתיקייה הראשית.
const handleMusicControls = require('../../../handlers/musicControls'); 

const musicControlIds = ['pause', 'resume', 'stop'];

module.exports = {
  customId: (interaction) => {
    const id = interaction.customId; 
    return musicControlIds.includes(id);
  },
  type: 'isButton',
  
  async execute(interaction, client) {
    try {
        if (handleMusicControls) {
            await handleMusicControls(interaction);
        } else {
            await interaction.reply({ content: '❌ מודול המוזיקה חסר.', ephemeral: true });
        }
    } catch (error) {
        console.error("Music Control Error:", error);
        await interaction.reply({ content: '❌ שגיאה בכפתורי המוזיקה.', ephemeral: true });
    }
  }
};
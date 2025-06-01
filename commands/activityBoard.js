// 📁 commands/activityBoard.js
const { SlashCommandBuilder } = require('discord.js');
const { postOrUpdateWeeklySchedule } = require('../handlers/scheduleUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('שלח או עדכן את לוח הפעילות השבועי (ידני)'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const msg = await postOrUpdateWeeklySchedule(client, true); // מצב ידני
      await interaction.editReply(msg || 'בוצע!');
    } catch (err) {
      console.error('שגיאה בהפעלת לוח פעילות:', err);
      await interaction.editReply('❌ שגיאה בשליחת הלוח. בדוק לוגים.');
    }
  }
};

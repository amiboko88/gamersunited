const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('אישרו_חוקים')
    .setDescription('📊 הצג כמה משתמשים אישרו את החוקים'),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '⛔ הפקודה זמינה למנהלים בלבד.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const snapshot = await db.collection('rulesAccepted').get();
      const total = snapshot.size;

      return interaction.editReply(`✅ נכון לעכשיו, **${total}** משתמשים אישרו את החוקים.`);
    } catch (err) {
      console.error('❌ שגיאה בשליפת נתוני חוקי הקהילה:', err);
      return interaction.editReply('❌ שגיאה בשליפת הנתונים. בדוק את הלוגים.');
    }
  }
};
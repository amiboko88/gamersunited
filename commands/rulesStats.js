// 📁 commands/rulesStats.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('אישרו_חוקים')
    .setDescription('📘 צפה ברשימת המשתמשים שאישרו את חוקי הקהילה')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // רק למנהלים

  async execute(interaction) {
    try {
      const snapshot = await db.collection('rulesAccepted').orderBy('acceptedAt', 'desc').get();
      const total = snapshot.size;

      if (total === 0) {
        return interaction.reply({
          content: '⚠️ אף אחד עדיין לא אישר את החוקים.',
          ephemeral: true
        });
      }

      const recent = snapshot.docs.slice(0, 10).map(doc => {
        const { userId, displayName, acceptedAt } = doc.data();
        const date = new Date(acceptedAt).toLocaleString('he-IL', {
          timeZone: 'Asia/Jerusalem',
          dateStyle: 'short',
          timeStyle: 'short'
        });
        return `• <@${userId}> (${displayName || '---'}) – ${date}`;
      });

      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ משתמשים שאישרו את חוקי הקהילה')
        .setDescription(recent.join('\n'))
        .addFields({ name: '\u200B', value: '\u200B' }) // מרווח בין טקסטים
.addFields({
  name: 'סה״כ מאושרים 🧾',
  value: `**${total.toLocaleString()}** משתמשים`,
  inline: true
})
        .setFooter({ text: 'נתוני חוקי הקהילה (שולף מ־Firestore)' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('❌ שגיאה בשליפת חוקי הקהילה:', err);
      await interaction.reply({
        content: '❌ שגיאה בזמן שליפת הנתונים.',
        ephemeral: true
      });
    }
  }
};

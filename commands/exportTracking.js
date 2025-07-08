const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ייצא_משתמשים')
    .setDescription('📤 מייצא את כל נתוני המעקב (memberTracking)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const snapshot = await db.collection('memberTracking').get();
    const data = {};

    snapshot.forEach(doc => {
      data[doc.id] = doc.data();
    });

    const filePath = path.join(__dirname, '..', 'temp_memberTracking.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    const file = new AttachmentBuilder(filePath);
    await interaction.editReply({
      content: '📎 הנה הקובץ עם כל נתוני המעקב:',
      files: [file]
    });

    // אופציונלי: מחק את הקובץ אחרי שליחה
    setTimeout(() => {
      try { fs.unlinkSync(filePath); } catch {}
    }, 5000);
  }
};

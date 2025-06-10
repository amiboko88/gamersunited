// 📁 voiceList.js
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const dayjs = require('dayjs');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('רשימת_הקלטות')
    .setDescription('מציג את רשימת כל ההקלטות שלך (30 הימים האחרונים)'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userDir = path.join(RECORDINGS_DIR, userId);

    if (!fs.existsSync(userDir)) {
      return interaction.reply({
        content: '❌ לא קיימות הקלטות עבורך.',
        ephemeral: true
      });
    }

    const files = fs.readdirSync(userDir)
      .filter(f => f.endsWith('.pcm'))
      .sort((a, b) => fs.statSync(path.join(userDir, b)).mtimeMs - fs.statSync(path.join(userDir, a)).mtimeMs);

    if (files.length === 0) {
      return interaction.reply({
        content: '📭 אין הקלטות זמינות כרגע.',
        ephemeral: true
      });
    }

    const list = files.map(f => {
      const fullPath = path.join(userDir, f);
      const stats = fs.statSync(fullPath);
      const time = dayjs(stats.mtime).format('DD/MM HH:mm');
      return `• \`${f}\` *(${time})*`;
    }).slice(0, 20); // מציג עד 20 קבצים אחרונים

    const replyText = `📁 **רשימת הקלטות שלך:**\n\n${list.join('\n')}`;

    return interaction.reply({ content: replyText, ephemeral: true });
  }
};

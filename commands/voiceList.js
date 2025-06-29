const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const dayjs = require('dayjs');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicelist')
    .setDescription('מציג את רשימת כל ההקלטות שלך'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userDir = path.join(RECORDINGS_DIR, userId);

    if (!fs.existsSync(userDir)) {
      return interaction.reply({
        content: '📭 אין הקלטות שמורות עבורך.',
        ephemeral: true
      });
    }

    const files = fs.readdirSync(userDir)
      .filter(f => f.endsWith('.mp3'))
      .sort((a, b) => fs.statSync(path.join(userDir, b)).mtimeMs - fs.statSync(path.join(userDir, a)).mtimeMs);

    if (files.length === 0) {
      return interaction.reply({
        content: '📭 אין קבצי MP3 זמינים.',
        ephemeral: true
      });
    }

    const formattedList = files.slice(0, 20).map((f, i) => {
      const fullPath = path.join(userDir, f);
      const stats = fs.statSync(fullPath);
      const time = dayjs(stats.mtime).format('DD/MM HH:mm');
      return `**${i + 1}.** \`${f}\` *(הוקלט ב־${time})*`;
    });

    return interaction.reply({
      content: `🎙️ **הקלטות אחרונות שלך:**\n\n${formattedList.join('\n')}`,
      ephemeral: true
    });
  }
};

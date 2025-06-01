// commands/help.js – פקודת עזרה דינמית לפי כל הפקודות הרשומות, דיסקורד.js v14+
// שימוש ב־flags: 64 (ephemeral replacement) | Node 22

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// רשימת אימוג'ים מומלצים – אפשר להרחיב לפי רצונך
const emojiMap = {
  leaderboard: '🏆',
  mvp: '🏅',
  tts: '🗣️',
  activity: '🗓️',
  verify: '✅',
  song: '🎵',
  soundboard: '🎶',
  fifo: '🎮',
  refreshrules: '🔄',
  rulesstats: '📑',
  'עזרה': '❓',
  // ...הוסף כאן התאמות אישיות
};

function getCommandEmoji(cmdName) {
  return emojiMap[cmdName] || '➡️';
}

// קבלת הרשימת פקודות הפעילה מתוך client.application.commands.cache (רק למה שרשום ב־index.js)
function getCommandsList(client) {
  // שים לב: יתכן שיהיו פקודות GLOBAL, לרוב רלוונטי רק ל־Guild
  return client.application.commands.cache.map(cmd => ({
    name: cmd.name,
    description: cmd.description,
    id: cmd.id,
    type: cmd.type
  }));
}

// בונה Embed דינמי מתוך ה־cache של הפקודות
function buildHelpEmbed(client) {
  const slashCmds = getCommandsList(client);

  // מציג רק פקודות Slash (type 1), ממוין לפי שם
  const filtered = slashCmds.filter(cmd => cmd.type === 1).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const desc = filtered.length
    ? filtered.map(cmd => `**/${cmd.name}** ${getCommandEmoji(cmd.name)} — ${cmd.description || ''}`).join('\n')
    : 'לא נמצאו פקודות פעילות בשרת 😮‍💨';

  return new EmbedBuilder()
    .setColor('#2b2d31')
    .setTitle('📋 עזרה – רשימת הפקודות הפעילות')
    .setDescription(desc)
    .setFooter({ text: 'FIFO BOT • תמיד עדכני, אוטומטי, דינמי' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('רשימת כל הפקודות הפעילות, אוטומטי לחלוטין.'),
  async execute(interaction) {
    // שימוש ב־flags: 64 במקום ephemeral
    await interaction.reply({
      embeds: [buildHelpEmbed(interaction.client)],
      flags: 64 // Private reply (החליף את ephemeral: true)
    });
  },
  // אין כפתורים – רק Embed רשימה פשוטה
  async handleButton() { return false; }
};

// commands/help.js – דינמי, Node 22 + discord.js v14+, עם flags: 64

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
};

function getCommandEmoji(cmdName) {
  return emojiMap[cmdName] || '➡️';
}

async function getCommandsList(client, guildId) {
  // שליפת הפקודות הכי עדכניות מהשרת הספציפי, לא מה-Cache בלבד
  const guild = await client.guilds.fetch(guildId);
  const commands = await guild.commands.fetch();
  return Array.from(commands.values())
    .filter(cmd => cmd.type === 1)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

async function buildHelpEmbed(client, guildId) {
  const cmds = await getCommandsList(client, guildId);

  const desc = cmds.length
    ? cmds.map(cmd =>
        `**/${cmd.name}** ${getCommandEmoji(cmd.name)} — ${cmd.description || ''}`
      ).join('\n')
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
    const guildId = interaction.guildId;
    const embed = await buildHelpEmbed(interaction.client, guildId);
    await interaction.reply({
      embeds: [embed],
      flags: 64 // Private reply
    });
  },
  async handleButton() { return false; }
};

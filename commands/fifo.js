const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createGroupsAndChannels } = require('../utils/squadBuilder');
const { log } = require('../utils/logger');
const { startGroupTracking } = require('../handlers/groupTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('פיפו')
    .setDescription('מחלק את המשתמשים בקול לקבוצות לפי כמות מבוקשת')
    .addIntegerOption(opt =>
      opt.setName('כמות').setDescription('כמה שחקנים בקבוצה (2, 3 או 4)').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),

  async execute(interaction) {
    const groupSize = interaction.options.getInteger('כמות');
    const validSizes = [2, 3, 4];
    if (!validSizes.includes(groupSize)) {
      return interaction.reply({ content: '🤨 רק 2, 3 או 4 מותרים.', ephemeral: true });
    }

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel || voiceChannel.parentId !== process.env.FIFO_CATEGORY_ID) {
      return interaction.reply({ content: '⛔ אתה חייב להיות בחדר בתוך קטגוריית וורזון פיפו.', ephemeral: true });
    }

    const role = interaction.guild.roles.cache.find(r => r.name === 'FIFO');
    if (!interaction.member.roles.cache.has(role?.id)) {
      return interaction.reply({ content: '🚫 אתה צריך תפקיד FIFO כדי להריץ את הפקודה.', ephemeral: true });
    }

    const members = voiceChannel.members.filter(m => !m.user.bot);
    if (members.size < 2) {
      return interaction.reply({ content: '🤏 צריך לפחות שני שחקנים.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize,
        categoryId: process.env.FIFO_CATEGORY_ID
      });

      const groupSummary = groups.map((group, i) => `🟦 **TEAM ${String.fromCharCode(65 + i)}**: ${group.map(m => m.displayName).join(', ')}`).join('\n');
      const waitingText = waiting.length ? `\n⏳ ממתין: ${waiting.map(m => m.displayName).join(', ')}` : '';

      await interaction.editReply({
        content: `✅ החלוקה בוצעה:\n${groupSummary}${waitingText}`
      });

      // התחל מעקב על כל קבוצה שהועברה
      groups.forEach((group, i) => {
        const ch = channels[i];
        if (ch) {
          startGroupTracking(interaction.guild, `TEAM ${String.fromCharCode(65 + i)}`, group.map(m => m.id), ch.id);
        }
      });

      log(`📊 בוצעה חלוקה לפיפו עם ${members.size} שחקנים בקבוצות של ${groupSize}`);
    } catch (err) {
      console.error('❌ שגיאה בפיפו:', err);
      interaction.editReply({ content: '❌ משהו השתבש. נסה שוב.' });
    }
  }
};

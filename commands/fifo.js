const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createGroupsAndChannels } = require('../utils/squadBuilder');
const { log } = require('../utils/logger');
const { startGroupTracking } = require('../handlers/groupTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('פיפו')
    .setDescription('מחלק את המשתמשים בקול לקבוצות לפי כמות מבוקשת')
    .addIntegerOption(opt =>
      opt
        .setName('כמות')
        .setDescription('כמה שחקנים בקבוצה (2, 3 או 4)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),

  async execute(interaction) {
    try {
      const groupSize = interaction.options.getInteger('כמות');
      const validSizes = [2, 3, 4];
      if (!validSizes.includes(groupSize)) {
        return await interaction.reply({ content: '🤨 רק 2, 3 או 4 מותרים.', ephemeral: true });
      }

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel || voiceChannel.parentId !== process.env.FIFO_CATEGORY_ID) {
        return await interaction.reply({ content: '⛔ אתה חייב להיות בחדר בתוך קטגוריית וורזון פיפו.', ephemeral: true });
      }

      const role = interaction.guild.roles.cache.find(r => r.name === 'FIFO');
      if (!interaction.member.roles.cache.has(role?.id)) {
        return await interaction.reply({ content: '🚫 אתה צריך תפקיד FIFO כדי להריץ את הפקודה.', ephemeral: true });
      }

      const members = voiceChannel.members.filter(m => !m.user.bot);
      if (members.size < 2) {
        return await interaction.reply({ content: '🤏 צריך לפחות שני שחקנים.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize,
        categoryId: process.env.FIFO_CATEGORY_ID
      });

      const groupSummary = groups
        .map((group, i) => `🟦 **TEAM ${String.fromCharCode(65 + i)}**: ${group.map(m => m.displayName).join(', ')}`)
        .join('\n');

      const waitingText = waiting.length
        ? `\n⏳ ממתינים: ${waiting.map(m => m.displayName).join(', ')}`
        : '';

      await interaction.editReply({
        content: `✅ החלוקה בוצעה:\n${groupSummary}${waitingText}`
      });

      groups.forEach((group, i) => {
        const ch = channels[i];
        if (ch) {
          startGroupTracking(
            interaction.guild,
            `TEAM ${String.fromCharCode(65 + i)}`,
            group.map(m => m.id),
            ch.id
          );
        }
      });

      log(`📊 ${interaction.user.tag} הריץ /פיפו עם ${members.size} שחקנים (גודל קבוצה: ${groupSize})`);
    } catch (err) {
      console.error('❌ שגיאה בפיפו:', err);

      log(`❌ שגיאה ב־/פיפו ע״י ${interaction.user.tag}:\n\`\`\`${err.message || err}\`\`\``);

      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: '❌ תקלה כללית. נסה שוב.', ephemeral: true });
      } else {
        await interaction.editReply({ content: '❌ משהו השתבש. נסה שוב.' });
      }
    }
  }
};

// 📁 interactions/buttons/repartition.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { createGroupsAndChannels, cleanupFifo } = require('../../utils/squadBuilder');
const { startGroupTracking } = require('../../handlers/groupTracker');
const { resetReplayVotes } = require('../../utils/replayManager');
const { log } = require('../../utils/logger');

const FIFO_CHANNEL_ID = '1231453923387379783'; 
const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID;
const DEFAULT_GROUP_SIZE = 4; // ברירת מחדל לחלוקה מחדש

module.exports = {
  customId: 'repartition_now',
  type: 'isButton',
  async execute(interaction) {
    log(`🔄 ${interaction.user.tag} לחץ על חלוקה מחדש`);

    const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
    if (!voiceChannel?.isVoiceBased()) {
      return interaction.reply({ content: '⛔ ערוץ הפיפו הראשי אינו זמין כרגע.', flags: MessageFlags.Ephemeral });
    }

    const members = voiceChannel.members.filter(m => !m.user.bot);
    if (members.size < 2) {
      return interaction.reply({ content: '⛔ אין מספיק שחקנים בפיפו לחלוקה מחדש.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // ניקוי קבוצות קיימות לפני יצירת חדשות
    await cleanupFifo(interaction, voiceChannel);

    const { squads, waiting, channels } = await createGroupsAndChannels({
      interaction,
      members: [...members.values()],
      groupSize: DEFAULT_GROUP_SIZE,
      categoryId: FIFO_CATEGORY_ID,
    });

    const summaryEmbed = new EmbedBuilder()
      .setTitle('📢 בוצעה חלוקה מחדש!')
      .setColor(0x00ff88)
      .setTimestamp();

    squads.forEach((squad, i) => {
      const name = `TEAM ${String.fromCharCode(65 + i)}`;
      summaryEmbed.addFields({
        name: `\u200F${name} (${squad.length} שחקנים)`,
        value: squad.map(m => `<@${m.id}>`).join(', '),
        inline: true
      });

      const ch = channels[i];
      if (ch) startGroupTracking(ch, squad.map(m => m.id), name);
    });

    if (waiting.length > 0) {
      summaryEmbed.addFields({
        name: '⏳ ממתינים',
        value: waiting.map(m => `<@${m.id}>`).join(', '),
        inline: true
      });
    }
    
    // שליחת הסיכום לערוץ שבו הכפתור נלחץ
    await interaction.channel.send({ embeds: [summaryEmbed] });
    await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה!' });
    resetReplayVotes();
  }
};
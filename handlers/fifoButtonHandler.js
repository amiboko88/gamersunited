// 📁 handlers/fifoButtonHandler.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { executeReplayReset } = require('../utils/repartitionUtils');
const {
  registerReplayVote,
  hasReplayVotes,
  hasBothTeamsVoted,
  resetReplayVotes
} = require('../utils/replayManager');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay');
const { createGroupsAndChannels } = require('../utils/squadBuilder');
const { startGroupTracking } = require('./groupTracker');
const { log } = require('../utils/logger');

const FIFO_CHANNEL_ID = '1231453923387379783'; // 🔁 עדכן לפי ערוץ הפיפו שלך
const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID;
const DEFAULT_GROUP_SIZE = 3;

async function handleFifoButtons(interaction, client) {
  const id = interaction.customId;

  // 🎯 איפוס קבוצה בודדת
  if (id.startsWith('replay_')) {
    const teamName = id.replace('replay_', '').replace('_', ' ');
    log(`🔁 ${interaction.user.tag} לחץ איפוס קבוצה: ${teamName}`);

    const voteResult = registerReplayVote(teamName, interaction.user.id);

    if (!voteResult) {
      return interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      content: `💬 ההצבעה שלך נרשמה. (${voteResult.voted}/${voteResult.total})`,
      flags: MessageFlags.Ephemeral
    });

    if (voteResult.allVoted) {
      log(`🗳️ כל חברי ${teamName} הצביעו לריפליי.`);

      const allTeams = require('../utils/replayManager').getAllReplayStates();
      const otherTeam = allTeams.find(t => t.teamName !== teamName);

      if (otherTeam) {
        const voiceChannel = interaction.guild.channels.cache.find(ch =>
          ch.name.includes(otherTeam.teamName.replace('TEAM ', 'TEAM '))
        );
        if (voiceChannel) {
          await playTTSInVoiceChannel(
            voiceChannel,
            `שחקני ${teamName} רוצים ריפליי. מה דעתכם ${otherTeam.teamName}?`
          );
        }
      }
    }

    if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
      log(`♻️ שתי הקבוצות הצביעו – מתבצע איפוס מלא.`);
      await executeReplayReset(interaction.guild, interaction.channel, teamName);
    }

    return;
  }
  // 🛑 איפוס כללי – רק ליוזם
  if (id.startsWith('reset_all_')) {
    const initiatorId = id.replace('reset_all_', '');
    if (interaction.user.id !== initiatorId) {
      return interaction.reply({
        content: '🚫 רק מי שיצר את הפיפו יכול לאפס את כל הקבוצות.',
        flags: MessageFlags.Ephemeral
      });
    }

    log(`🚨 ${interaction.user.tag} לחץ על איפוס כללי`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await executeReplayReset(interaction.guild, interaction.channel, 'TEAM A');
    await interaction.editReply({ content: '✅ כל הקבוצות אופסו בהצלחה!' });
    return;
  }

  // ♻️ חלוקה מחדש
  if (id === 'repartition_now') {
    log(`🔄 ${interaction.user.tag} לחץ על חלוקה מחדש`);

    const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
    if (!voiceChannel?.isVoiceBased()) {
      return await interaction.reply({ content: '⛔ ערוץ הפיפו אינו זמין כרגע.', flags: MessageFlags.Ephemeral });
    }

    const members = voiceChannel.members.filter(m => !m.user.bot);
    if (members.size < 2) {
      return await interaction.reply({ content: '⛔ אין מספיק שחקנים בפיפו.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { groups, waiting, channels } = await createGroupsAndChannels({
      interaction,
      members: [...members.values()],
      groupSize: DEFAULT_GROUP_SIZE,
      categoryId: FIFO_CATEGORY_ID,
      openChannels: true
    });

    const summaryEmbed = new EmbedBuilder()
      .setTitle('📢 בוצעה חלוקה מחדש!')
      .setColor(0x00ff88)
      .setTimestamp();

    groups.forEach((group, i) => {
      const name = `TEAM ${String.fromCharCode(65 + i)}`;
      summaryEmbed.addFields({
        name,
        value: group.map(m => m.displayName).join(', '),
        inline: false
      });

      const ch = channels[i];
      if (ch) startGroupTracking(ch, group.map(m => m.id), name);
    });

    if (waiting.length > 0) {
      summaryEmbed.addFields({
        name: '⏳ ממתינים',
        value: waiting.map(m => m.displayName).join(', '),
        inline: false
      });
    }

    await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה!', embeds: [summaryEmbed] });
    resetReplayVotes();
    return;
  }
}

module.exports = { handleFifoButtons };

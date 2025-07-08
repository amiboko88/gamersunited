// 📁 handlers/repartitionUtils.js

const replayVotes = new Map(); // Map<teamName, Set<userId>>
let groupTracking = new Map(); // Map<channelId, { teamName, userIds }>

function registerReplayVote(teamName, userId) {
  if (!replayVotes.has(teamName)) {
    replayVotes.set(teamName, new Set());
  }
  const votes = replayVotes.get(teamName);
  votes.add(userId);

  const allGroups = new Map();
  for (const [channelId, data] of groupTracking.entries()) {
    allGroups.set(data.teamName, data);
  }

  return {
    allVoted: hasBothTeamsVoted(),
    allGroups
  };
}

function hasReplayVotes(teamName) {
  return replayVotes.has(teamName) && replayVotes.get(teamName).size > 0;
}

function hasBothTeamsVoted() {
  return [...replayVotes.values()].filter(set => set.size > 0).length >= 2;
}

function resetReplayVotes() {
  replayVotes.clear();
}

function startGroupTracking(channel, userIds, teamName) {
  groupTracking.set(channel.id, {
    teamName,
    userIds
  });
}

function handleRulesInteraction(interaction) {
  return interaction.reply({ content: '📜 קראת ואישרת את החוקים!', flags: MessageFlags.Ephemeral });
}

async function executeReplayReset(guild, channel, teamName) {
  await channel.send(`♻️ כל השחקנים הצביעו לריפליי של ${teamName}. מתבצעת חלוקה מחדש...`);
  // אפשר להרחיב עם פעולות נוספות
}

function createGroupsAndChannels({ interaction, members, groupSize = 3, categoryId, openChannels = true }) {
  const groups = [];
  const waiting = [];
  const channels = [];

  members = [...members].sort(() => Math.random() - 0.5);

  while (members.length >= groupSize) {
    groups.push(members.splice(0, groupSize));
  }
  if (members.length > 0) waiting.push(...members);

  const createChannelPromises = groups.map((group, i) => {
    const channelName = `team-${String.fromCharCode(65 + i)}`;
    return interaction.guild.channels.create({
      name: channelName,
      type: 2, // GUILD_VOICE
      parent: categoryId
    }).then(vc => {
      channels[i] = vc;
      return vc;
    });
  });

  return Promise.all(createChannelPromises).then(() => {
    return { groups, waiting, channels };
  });
}

module.exports = {
  handleRulesInteraction,
  registerReplayVote,
  hasReplayVotes,
  hasBothTeamsVoted,
  resetReplayVotes,
  startGroupTracking,
  executeReplayReset,
  createGroupsAndChannels
};

// 📁 utils/squadBuilder.js – יצירת קבוצות FIFO עם שמות בכותרת וללא נעילה

const { ChannelType } = require('discord.js');

function buildSquads(members, squadSize) {
  const players = [...members];
  shuffle(players);

  const squads = [];
  const waiting = [];

  while (players.length >= squadSize) {
    squads.push(players.splice(0, squadSize));
  }

  if (players.length > 0) {
    if (squadSize === 4 && players.length === 3) {
      squads.push(players.splice(0, 3));
    } else if (squadSize >= 3 && players.length === 2) {
      squads.push(players.splice(0, 2));
    } else {
      waiting.push(...players.splice(0));
    }
  }

  return { squads, waiting };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function createGroupsAndChannels({ interaction, members, groupSize, categoryId, openChannels = false }) {
  const { squads, waiting } = buildSquads(members, groupSize);
  const channels = [];

  for (let i = 0; i < squads.length; i++) {
    const squad = squads[i];
    const baseName = `TEAM ${String.fromCharCode(65 + i)}`;
    const displayNames = squad.map(m => m.displayName).join(', ');
    let name = `${baseName} | ${displayNames}`;

    // חיתוך אם ארוך מדי (מקסימום 100 תווים)
    if (name.length > 100) {
      const trimmed = displayNames.slice(0, 100 - baseName.length - 4);
      name = `${baseName} | ${trimmed}...`;
    }

    const options = {
      name,
      type: ChannelType.GuildVoice,
      parent: categoryId
    };

    // 🛡️ אם לא מבקשים פתיחה – יוצרים הגבלות גישה
    if (!openChannels) {
      options.permissionOverwrites = [
        {
          id: interaction.guild.roles.everyone.id,
          deny: ['Connect']
        },
        ...squad.map(member => ({
          id: member.id,
          allow: ['Connect']
        }))
      ];
    }

    const channel = await interaction.guild.channels.create(options);

    for (const member of squad) {
      await member.voice.setChannel(channel).catch(() => {});
    }

    channels.push(channel);
  }

  return { groups: squads, waiting, channels };
}

module.exports = {
  buildSquads,
  createGroupsAndChannels
};

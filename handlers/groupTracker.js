const { ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { log } = require('../utils/logger');

const activeGroups = new Map();

function startGroupTracking(guild, groupName, userIds, channelId) {
  const key = `${guild.id}-${channelId}`;
  if (activeGroups.has(key)) return;

  const tracker = {
    users: new Set(userIds),
    left: new Set(),
    timeout: setTimeout(() => cleanup(key), 180_000),
  };

  activeGroups.set(key, tracker);
  log(`📡 התחיל מעקב על ${groupName} למשך 3 דק'`);

  const interval = setInterval(async () => {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      clearInterval(interval);
      cleanup(key);
      return;
    }

    const currentIds = new Set(channel.members.filter(m => !m.user.bot).map(m => m.id));
    const leftUsers = [...tracker.users].filter(id => !currentIds.has(id));
    if (leftUsers.length > 0) {
      tracker.left = new Set(leftUsers);
      sendLeftAlert(guild, groupName, leftUsers);
      clearInterval(interval);
      cleanup(key);
    }
  }, 10_000);
}

function sendLeftAlert(guild, groupName, userIds) {
  const mainChannel = guild.channels.cache.find(
    ch => ch.name.toLowerCase().includes('fifo-main') && ch.isTextBased()
  );
  if (!mainChannel) return;

  const names = userIds.map(id => `<@${id}>`).join(', ');
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('report_return')
      .setLabel('חזר זמנית')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('report_kick')
      .setLabel('העיף את הקבוצה')
      .setStyle(ButtonStyle.Danger)
  );

  mainChannel.send({
    content: `🤨 ${names} נטשו את **${groupName}**! מה עושים?`,
    components: [buttons],
  });

  log(`🚨 ${names} נטשו את ${groupName}`);
}

function cleanup(key) {
  const tracker = activeGroups.get(key);
  if (tracker?.timeout) clearTimeout(tracker.timeout);
  activeGroups.delete(key);
}

module.exports = { startGroupTracking };

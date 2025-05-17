// 📁 handlers/channelCleaner.js
const { ChannelType } = require('discord.js');

const CATEGORY_ID = '689124379019313214'; // קטגוריית פיפו הראשית
let lastCleanupDate = null;

function startCleanupScheduler(client) {
  const targetHour = 4;
  const interval = 60 * 1000; // דקה

  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const dateKey = now.toISOString().split('T')[0];
    if (hour !== targetHour || minute !== 0 || lastCleanupDate === dateKey) return;
    lastCleanupDate = dateKey;

    for (const guild of client.guilds.cache.values()) {
      const category = guild.channels.cache.get(CATEGORY_ID);
      if (!category) continue;

      const teamChannels = category.children.cache.filter(
        c => c.type === ChannelType.GuildVoice && c.name.startsWith('TEAM')
      );

      for (const [id, channel] of teamChannels) {
        if (channel.members.size === 0) {
          await channel.delete().catch(() => {});
          console.log(`🧹 נמחק הערוץ הריק: ${channel.name}`);
        }
      }
    }
  }, interval);
}

module.exports = { startCleanupScheduler };

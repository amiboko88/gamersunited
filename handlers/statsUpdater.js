const dayjs = require('dayjs');

const CATEGORY_ID = '689124379019313214'; // קטגוריית FIFO
let displayChannelId = null;
let lastActive = null;
let lastCount = null;

const DISPLAY_CHANNEL_NAME_PREFIX = '🔊 In Voice:';
const MIN_ACTIVE_DURATION_MINUTES = 1;
const DELETE_AFTER_MINUTES = 5;

async function updateDisplayChannel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const voiceChannelsInCategory = guild.channels.cache.filter(c =>
    c.parentId === CATEGORY_ID && c.type === 2
  );

  const count = [...voiceChannelsInCategory.values()]
    .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);

  const now = dayjs();

  if (count > 0) {
    if (!lastActive) lastActive = now;

    // צור ערוץ תצוגה אם צריך
    if (!displayChannelId && now.diff(lastActive, 'minute') >= MIN_ACTIVE_DURATION_MINUTES) {
      const newChannel = await guild.channels.create({
        name: `${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`,
        type: 2,
        parent: CATEGORY_ID,
        position: 0,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ['Connect'],
            allow: ['ViewChannel']
          }
        ]
      });

      displayChannelId = newChannel.id;
      lastCount = count;

      console.log(`🆕 [${now.format('HH:mm:ss')}] נוצר ערוץ תצוגה עם ${count} מחוברים`);
    }

    // עדכון שם רק אם יש שינוי במספר
    if (displayChannelId && count !== lastCount) {
      const displayChannel = guild.channels.cache.get(displayChannelId);
      if (displayChannel) {
        await displayChannel.setName(`${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`);
        console.log(`🔄 [${now.format('HH:mm:ss')}] שם ערוץ תצוגה עודכן ל־${count}`);
        lastCount = count;
      }
    }
  }

  // מחיקה אם אין פעילות
  if (displayChannelId && count === 0 && lastActive && now.diff(lastActive, 'minute') >= DELETE_AFTER_MINUTES) {
    const displayChannel = guild.channels.cache.get(displayChannelId);
    if (displayChannel) {
      await displayChannel.delete().catch(() => {});
      console.log(`🗑️ [${now.format('HH:mm:ss')}] ערוץ תצוגה נמחק (אין פעילות)`);
    }
    displayChannelId = null;
    lastActive = null;
    lastCount = null;
  }

  if (count === 0) {
    lastActive = null;
  }
}

function startStatsUpdater(client) {
  setInterval(() => {
    updateDisplayChannel(client).catch(console.error);
  }, 30 * 1000); // בדיקה כל 30 שניות
}

module.exports = {
  startStatsUpdater
};

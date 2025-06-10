const dayjs = require('dayjs');

const CATEGORY_ID = '689124379019313214'; // קטגוריית FIFO
const DISPLAY_CHANNEL_NAME_PREFIX = '🔊 In Voice:';
const MIN_ACTIVE_DURATION_MINUTES = 1;
const DELETE_AFTER_MINUTES = 5;

let lastActive = null;
let lastCount = null;

async function updateDisplayChannel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const voiceChannels = guild.channels.cache.filter(c =>
    c.parentId === CATEGORY_ID && c.type === 2
  );

  const count = [...voiceChannels.values()]
    .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);

  const now = dayjs();

  // 🔍 חפש אם כבר קיים ערוץ תצוגה
  let displayChannel = guild.channels.cache.find(
    c => c.parentId === CATEGORY_ID && c.type === 2 && c.name.startsWith(DISPLAY_CHANNEL_NAME_PREFIX)
  );

  // 🧠 אם יש פעילות
  if (count > 0) {
    if (!lastActive) lastActive = now;

    // צור ערוץ אם אין קיים
    if (!displayChannel && now.diff(lastActive, 'minute') >= MIN_ACTIVE_DURATION_MINUTES) {
      displayChannel = await guild.channels.create({
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
      lastCount = count;
      console.log(`🆕 [${now.format('HH:mm:ss')}] נוצר ערוץ תצוגה עם ${count} משתמשים`);
    }

    // עדכון שם אם השתנה המספר
    if (displayChannel && count !== lastCount) {
      await displayChannel.setName(`${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`);
      console.log(`🔄 [${now.format('HH:mm:ss')}] עודכן שם ערוץ תצוגה ל־${count}`);
      lastCount = count;
    }
  }

  // 🗑️ מחיקה אם אין פעילות
  if (displayChannel && count === 0 && lastActive && now.diff(lastActive, 'minute') >= DELETE_AFTER_MINUTES) {
    await displayChannel.delete().catch(() => {});
    console.log(`🗑️ [${now.format('HH:mm:ss')}] ערוץ תצוגה נמחק – אין פעילות`);
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
  }, 30 * 1000);
}

module.exports = {
  startStatsUpdater
};

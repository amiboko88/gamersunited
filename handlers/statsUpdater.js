const dayjs = require('dayjs');

const VOICE_SOURCE_CHANNEL_ID = '1231453923387379783'; // TEAM ROTATION
let displayChannelId = null;
let displayChannelCreatedAt = null;
let lastActive = null;

const DISPLAY_CHANNEL_NAME_PREFIX = '🎙️ בשיחה כעת:';
const MIN_ACTIVE_DURATION = 1; // דקות
const DELETE_AFTER = 5; // דקות

async function updateDisplayChannel(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const sourceChannel = guild.channels.cache.get(VOICE_SOURCE_CHANNEL_ID);
  if (!sourceChannel) return;

  const count = sourceChannel.members.filter(m => !m.user.bot).size;
  const now = dayjs();

  if (count > 0) {
    if (!lastActive) lastActive = now;

    // נוצר ערוץ אם יש שהייה של לפחות דקה
    if (!displayChannelId && now.diff(lastActive, 'minute') >= MIN_ACTIVE_DURATION) {
      const newChannel = await guild.channels.create({
        name: `${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`,
        type: 2,
        parent: sourceChannel.parentId,
        position: sourceChannel.rawPosition - 1,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ['Connect'],
            allow: ['ViewChannel']
          }
        ]
      });

      displayChannelId = newChannel.id;
      displayChannelCreatedAt = now;
      console.log(`[+] [${now.format('HH:mm:ss')}] נוצר ערוץ תצוגה: ${newChannel.name}`);
    }

    // עדכון שם אם קיים וצריך שינוי
    if (displayChannelId) {
      const displayChannel = guild.channels.cache.get(displayChannelId);
      if (displayChannel && displayChannel.name !== `${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`) {
        await displayChannel.setName(`${DISPLAY_CHANNEL_NAME_PREFIX} ${count}`);
        console.log(`🔄 [${now.format('HH:mm:ss')}] עודכן שם ערוץ: ${displayChannel.name}`);
      }
    }
  }

  // אם אין משתמשים – נבדוק מחיקה
  if (displayChannelId && count === 0) {
    if (lastActive && now.diff(lastActive, 'minute') >= DELETE_AFTER) {
      const displayChannel = guild.channels.cache.get(displayChannelId);
      if (displayChannel) {
        await displayChannel.delete().catch(() => {});
        console.log(`[-] [${now.format('HH:mm:ss')}] ערוץ תצוגה נמחק עקב חוסר פעילות`);
      }
      displayChannelId = null;
      displayChannelCreatedAt = null;
      lastActive = null;
    }
  }

  if (count === 0) {
    lastActive = null;
  }
}

function startStatsUpdater(client) {
  setInterval(() => {
    updateDisplayChannel(client).catch(console.error);
  }, 30 * 1000); // ריצה כל 30 שניות
}

module.exports = {
  startStatsUpdater
};

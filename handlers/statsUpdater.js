const dayjs = require('dayjs');
const db = require('../utils/firebase');

// תוספים ל־dayjs
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(isSameOrAfter);
dayjs.extend(localizedFormat);
dayjs.extend(customParseFormat);

const STATS_CHANNEL_ID = '1381279896059248700'; // 🟦 עדכן ל-ID של ערוץ הטופיק
const VERIFIED_ROLE_ID = '1120787309432938607';

let lastStatsUpdate = 0;
const MIN_INTERVAL = 30 * 1000;

async function updateStatsChannelTopic(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.get(STATS_CHANNEL_ID);
  if (!channel) return;

  const onlineCount = guild.members.cache.filter(m =>
    !m.user.bot && m.presence && ['online', 'idle', 'dnd'].includes(m.presence.status)
  ).size;

  const inVoiceCount = guild.channels.cache
    .filter(c => c.type === 2)
    .reduce((acc, c) => acc + c.members.filter(m => !m.user.bot).size, 0);

  const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
  const verifiedCount = verifiedRole ? verifiedRole.members.size : 0;

  const startOfMonth = dayjs().startOf('month');
  const newThisMonthCount = guild.members.cache.filter(m =>
    !m.user.bot && dayjs(m.joinedAt).isAfter(startOfMonth)
  ).size;

  let birthdaysToday = 0;
  const today = dayjs().format('DD-MM');
  const snapshot = await db.collection('birthdays').get();
  snapshot.forEach(doc => {
    const { birthday } = doc.data();
    if (birthday?.day && birthday?.month) {
      const dayStr = String(birthday.day).padStart(2, '0');
      const monthStr = String(birthday.month).padStart(2, '0');
      if (`${dayStr}-${monthStr}` === today) birthdaysToday++;
    }
  });

  const mvpStats = await db.collection('mvpStats').get();

  // 🧠 Topic מעוצב בעברית
  const topic = `🟢 מחוברים: ${onlineCount} • 🔊 בשיחה: ${inVoiceCount} • 🎉 ימי הולדת: ${birthdaysToday} • 🛡️ מאומתים: ${verifiedCount} • 🏆 MVPים: ${mvpStats.size}`;

  if (channel.topic !== topic) {
    await channel.setTopic(topic);
    console.log(`📊 [${dayjs().format('HH:mm:ss')}] טופיק עודכן`);
  }
}

function safeUpdateStats(client, source = 'event') {
  const now = Date.now();
  if (now - lastStatsUpdate >= MIN_INTERVAL) {
    lastStatsUpdate = now;
    console.log(`⚙️ עדכון סטטיסטיקות מ-${source}`);
    updateStatsChannelTopic(client).catch(console.error);
  }
}

function startStatsUpdater(client) {
  setInterval(() => {
    const time = new Date().toLocaleTimeString();
    console.log(`🔄 [${time}] ⏱️ עדכון אוטומטי של טופיק (Heartbeat)`);
    updateStatsChannelTopic(client).catch(console.error);
  }, 5 * 60 * 1000);
}


module.exports = {
  updateStatsChannelTopic,
  startStatsUpdater,
  safeUpdateStats
};

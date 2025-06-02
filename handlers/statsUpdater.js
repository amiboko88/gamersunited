const moment = require('moment');
const db = require('../utils/firebase'); // שנה נתיב לפי הצורך

// כאן הכנסת את כל הערוצים כקונסטים
const VERIFIED_CHANNEL_ID    = '1379187238948307005';
const ONLINE_CHANNEL_ID      = '1379187136300978366';
const INVOICE_CHANNEL_ID     = '1379187180131451071';
const MVP_CHANNEL_ID         = '1379187341293387806';
const NEW_MONTH_CHANNEL_ID   = '1379187280052355112';
const BIRTHDAY_CHANNEL_ID    = '1379187314726670478';

// וגם את ה-ROLE
const VERIFIED_ROLE_ID = '1120787309432938607'; // עדכן במידת הצורך

async function updateStatsChannels(client) {
  const guild = client.guilds.cache.first();

  // 🟢 ONLINE
  const onlineCount = guild.members.cache.filter(m =>
    !m.user.bot &&
    m.presence &&
    ['online', 'idle', 'dnd'].includes(m.presence.status)
  ).size;
  await guild.channels.cache.get(ONLINE_CHANNEL_ID)?.setName(`🟢 Online: ${onlineCount}`);

  // 🔊 IN VOICE
  const inVoiceCount = guild.channels.cache.filter(c => c.type === 2)
    .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);
  await guild.channels.cache.get(INVOICE_CHANNEL_ID)?.setName(`🔊 In Voice: ${inVoiceCount}`);

  // 🛡️ VERIFIED
  const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
  const verifiedCount = verifiedRole ? verifiedRole.members.size : 0;
  await guild.channels.cache.get(VERIFIED_CHANNEL_ID)?.setName(`🛡️ Verified: ${verifiedCount}`);

  // 🆕 NEW THIS MONTH
  const startOfMonth = moment().startOf('month');
  const newThisMonthCount = guild.members.cache.filter(m =>
    !m.user.bot && moment(m.joinedAt).isAfter(startOfMonth)
  ).size;
  await guild.channels.cache.get(NEW_MONTH_CHANNEL_ID)?.setName(`🆕 New This Month: ${newThisMonthCount}`);

  // 🎉 BIRTHDAYS TODAY
  let birthdaysToday = 0;
  const today = moment().format('DD-MM');
  const snapshot = await db.collection('birthdays').get();
  snapshot.forEach(doc => {
    const { birthday } = doc.data();
    if (birthday && birthday.day && birthday.month) {
      const dayStr = String(birthday.day).padStart(2, '0');
      const monthStr = String(birthday.month).padStart(2, '0');
      const bday = `${dayStr}-${monthStr}`;
      if (bday === today) birthdaysToday++;
    }
  });
  await guild.channels.cache.get(BIRTHDAY_CHANNEL_ID)?.setName(`🎉 Birthdays Today: ${birthdaysToday}`);

  // 🏆 MVPs (כמות ייחודית של זוכים)
  let mvpCount = 0;
  const mvpStats = await db.collection('mvpStats').get();
  mvpCount = mvpStats.size;
  await guild.channels.cache.get(MVP_CHANNEL_ID)?.setName(`🏆 MVPs: ${mvpCount}`);
}

// הפעל פעם ב־5 דקות (או גם ידנית אחרי אירועים חשובים)
function startStatsUpdater(client) {
  setInterval(() => {
    updateStatsChannels(client).catch(console.error);
  }, 5 * 60 * 1000);
}

module.exports = { startStatsUpdater, updateStatsChannels };

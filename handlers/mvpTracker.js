const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger');

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_ANNOUNCE_CHANNEL_ID = '583575179880431616';

let lastPrintedDate = null; // 🧠 כדי למנוע ספאם בלוג אם כבר הוכרז היום

async function updateVoiceActivity(memberId, durationMinutes, db) {
  const voiceRef = db.doc(`voiceTime/${memberId}`);
  const voiceSnap = await voiceRef.get();

  if (!voiceSnap.exists) {
    await voiceRef.set({ minutes: durationMinutes });
  } else {
    const data = voiceSnap.data();
    await voiceRef.update({ minutes: (data.minutes || 0) + durationMinutes });
  }

  const lifeRef = db.doc(`voiceLifetime/${memberId}`);
  const lifeSnap = await lifeRef.get();

  if (!lifeSnap.exists) {
    await lifeRef.set({ total: durationMinutes });
  } else {
    const data = lifeSnap.data();
    await lifeRef.update({ total: (data.total || 0) + durationMinutes });
  }

  log(`📈 עדכון פעילות ל־${memberId}: ${durationMinutes} דקות`);
}

async function calculateAndAnnounceMVP(client, db) {
  const voiceRef = await db.collection('voiceTime').get();
  if (voiceRef.empty) return;

  let topUser = null;
  let maxMinutes = 0;

  voiceRef.forEach(doc => {
    const data = doc.data();
    if (data.minutes > maxMinutes) {
      maxMinutes = data.minutes;
      topUser = { id: doc.id, minutes: data.minutes };
    }
  });

  if (!topUser) return;

  const guild = client.guilds.cache.first();
  const member = await guild.members.fetch(topUser.id).catch(() => null);
  if (!member) return;

  const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
  if (!mvpRole) {
    log(`❌ תפקיד MVP לא נמצא לפי ID: ${MVP_ROLE_ID}`);
    return;
  }

  try {
    const allMembers = await guild.members.fetch({ time: 10000 });
    allMembers.forEach(m => {
      if (m.roles.cache.has(mvpRole.id)) {
        m.roles.remove(mvpRole).catch(() => {});
      }
    });
  } catch (err) {
    if (err.code === 'GuildMembersTimeout') {
      log(`⚠️ לא ניתן לטעון את כל המשתמשים ל־MVP: ${guild.name}`);
    } else {
      log(`❌ שגיאה כללית בטעינת משתמשים ל־MVP: ${err.message}`);
    }
  }

  await member.roles.add(mvpRole).catch(() => {});

  const statsRef = db.doc(`mvpStats/${topUser.id}`);
  const statsSnap = await statsRef.get();
  const wins = statsSnap.exists ? (statsSnap.data().wins || 0) + 1 : 1;
  await statsRef.set({ wins });

  const channel = client.channels.cache.get(MVP_ANNOUNCE_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('🥇 MVP השבועי')
    .setDescription(`מזל טוב ל־<@${topUser.id}> על **${topUser.minutes} דקות** של נוכחות 🎤!\nסה״כ זכיות: **${wins}**`)
    .setTimestamp()
    .setFooter({ text: 'שמעון הבוט – מצטייני השבוע' });

  const message = await channel.send({
    content: '@everyone',
    embeds: [embed]
  }).catch(() => null);

  if (message) {
    await message.react('🏅').catch(() => {});
    await db.doc('mvpSystem/status').set({
      lastCalculated: Timestamp.now(),
      lastAnnouncedDate: new Date().toISOString().split('T')[0],
      messageId: message.id,
      channelId: channel.id
    });
  }

  for (const docSnap of voiceRef.docs) {
    await db.doc(`voiceTime/${docSnap.id}`).update({ minutes: 0 }).catch(() => {});
  }

  log(`✅ MVP הוכרז ונשלח – ${topUser.id}`);
}

async function checkMVPStatusAndRun(client, db) {
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();

  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // ישראל
  const todayDate = now.toISOString().split('T')[0];
  let lastDate = '1970-01-01';

  if (statusSnap.exists) {
    lastDate = statusSnap.data().lastAnnouncedDate || lastDate;
  }

  if (todayDate === lastDate) {
    if (lastPrintedDate !== todayDate) {
      log(`⏱️ כבר הוכרז היום (today: ${todayDate}) – לא מכריז שוב`);
      lastPrintedDate = todayDate;
    }
    return;
  }

  const day = now.getDay(); // 0 = ראשון
  const hour = now.getHours();
  const minute = now.getMinutes();

  log(`[MVP] בדיקה: יום=${day}, שעה=${hour}, דקה=${minute}`);

  if (day === 0 && hour === 20 && minute === 0) {
    log('⏳ הגיע הזמן להכריז MVP...');
    await calculateAndAnnounceMVP(client, db);
  } else {
    // נשתוק אם לא הזמן, כדי לא להציף את הלוג כל דקה
  }
}

function startMvpScheduler(client, db) {
  setInterval(() => {
    checkMVPStatusAndRun(client, db);
  }, 60 * 1000); // כל דקה
}

module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  startMvpScheduler
};

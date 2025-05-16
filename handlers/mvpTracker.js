const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger');

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_ANNOUNCE_CHANNEL_ID = '583575179880431616';

// ⏱️ עדכון פעילות קולית – כולל lifetime
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

// 🏆 חישוב והענקת MVP שבועי
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
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle('🥇 MVP השבועי')
      .setDescription(`מזל טוב ל־<@${topUser.id}> על **${topUser.minutes} דקות** של נוכחות 🎤!\nסה״כ זכיות: **${wins}**`)
      .setTimestamp()
      .setFooter({ text: 'שימי הבוט - מצטייני השבוע' });

    await channel.send({ content: '@everyone', embeds: [embed] }).catch(() => {});
  }

  for (const docSnap of voiceRef.docs) {
    await db.doc(`voiceTime/${docSnap.id}`).update({ minutes: 0 }).catch(() => {});
  }

  await db.doc('mvpSystem/status').set({ lastCalculated: Timestamp.now() });
}

// 🕒 הפעלה שבועית
async function checkMVPStatusAndRun(client, db) {
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();

  const now = Timestamp.now();
  let shouldRun = false;

  if (!statusSnap.exists) {
    shouldRun = true;
  } else {
    const last = statusSnap.data().lastCalculated?.toDate() || new Date(0);
    const diff = now.toDate() - last;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;

    if (diff >= oneWeek || new Date().getDay() === 0) {
      shouldRun = true;
    }
  }

  if (shouldRun) {
    log('⏳ מחשב MVP שבועי...');
    await calculateAndAnnounceMVP(client, db);
  } else {
    log('✅ MVP כבר חושב השבוע.');
  }
}

module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun
};

const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { log } = require('../utils/logger');

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_CHANNEL_ID = '583575179880431616'

let lastPrintedDate = null;

async function calculateAndAnnounceMVP(client, db, force = false) {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // זמן ישראל
  const today = now.toISOString().split('T')[0];
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();
  const statusData = statusSnap.exists ? statusSnap.data() : null;

  if (!force && statusData?.lastAnnouncedDate === today) {
    log(`⛔ MVP כבר הוכרז היום (${today}) – מתעלם`);
    return;
  }

  const statsRef = db.collection('weeklyStats');
  const statsSnap = await statsRef.get();
  if (statsSnap.empty) {
    log('⚠️ אין weeklyStats – לא ניתן לחשב MVP');
    return;
  }

  let topUser = null, maxScore = 0;

  for (const doc of statsSnap.docs) {
    const data = doc.data();
    const score = data.xpThisWeek || 0;

    if (score > maxScore) {
      maxScore = score;
      topUser = {
        id: doc.id,
        score,
        voice: data.voiceMinutes || 0,
        xp: score
      };
    }
  }

  if (!topUser) return log(`⚠️ לא נמצא מועמד ראוי ל־MVP`);

  const guild = client.guilds.cache.first();
  const member = await guild.members.fetch(topUser.id).catch(() => null);
  if (!member) return;

  const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
  if (!mvpRole) return log(`❌ תפקיד MVP לא נמצא`);

  try {
    const allMembers = await guild.members.fetch();
    allMembers.forEach(m => {
      if (m.roles.cache.has(mvpRole.id)) {
        m.roles.remove(mvpRole).catch(() => {});
      }
    });
  } catch (err) {
    log(`⚠️ שגיאה בטעינת משתמשים`);
  }

  await member.roles.add(mvpRole).catch(() => {});
  const mvpStatsRef = db.doc(`mvpStats/${topUser.id}`);
  const mvpStatsSnap = await mvpStatsRef.get();
  const wins = mvpStatsSnap.exists ? (mvpStatsSnap.data().wins || 0) + 1 : 1;
  await mvpStatsRef.set({ wins });

  const imagePath = await renderMvpImage({
    username: member.displayName || member.user.username,
    avatarURL: member.displayAvatarURL({ extension: 'png', size: 512 }),
    minutes: topUser.voice,
    wins,
    fresh: true
  });

  const channel = client.channels.cache.get(MVP_CHANNEL_ID);
  if (!channel) return log(`❌ ערוץ MVP לא נמצא`);

  if (statusData?.messageId && statusData?.channelId) {
    const oldChannel = client.channels.cache.get(statusData.channelId);
    const oldMessage = await oldChannel?.messages?.fetch(statusData.messageId).catch(() => null);
    if (oldMessage) {
      await oldMessage.delete().catch(() => {});
    }
  }

  const message = await channel.send({ content: '@everyone', files: [imagePath] }).catch(() => null);
  if (!message) return;

  await message.react('🏅').catch(() => {});

  await statusRef.set({
    lastCalculated: Timestamp.now(),
    lastAnnouncedDate: today,
    messageId: message.id,
    channelId: message.channel.id,
    reacted: false
  });

  for (const doc of statsSnap.docs) {
    await db.doc(`weeklyStats/${doc.id}`).delete().catch(() => {});
  }

  log(`🏆 MVP: ${member.user.username} (${topUser.voice} דקות, ${topUser.xp} XP, ${wins} זכיות)`);
}

async function checkMVPStatusAndRun(client, db) {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const today = now.toISOString().split('T')[0];
  const day = now.getDay(); // 0 = ראשון

  if (day !== 0) return;

  const statusSnap = await db.doc('mvpSystem/status').get();
  const lastDate = statusSnap.exists ? statusSnap.data()?.lastAnnouncedDate : null;

  if (lastDate === today) {
    const { messageId, channelId } = statusSnap.data();
    const message = await client.channels.cache.get(channelId)?.messages?.fetch(messageId).catch(() => null);
    if (message) {
      if (lastPrintedDate !== today) {
        lastPrintedDate = today;
        log(`⏱️ MVP כבר פורסם היום`);
      }
      return;
    }
    log(`⚠️ ההודעה נמחקה – פרסום מחדש`);
    await calculateAndAnnounceMVP(client, db, true);
    return;
  }

  if (lastPrintedDate !== today) {
    log(`📢 יום ראשון – מחשב MVP...`);
    lastPrintedDate = today;
  }

  await calculateAndAnnounceMVP(client, db);
}

function startMvpScheduler(client, db) {
  setInterval(() => {
    checkMVPStatusAndRun(client, db);
  }, 60 * 1000);
}

module.exports = {
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  startMvpScheduler
};

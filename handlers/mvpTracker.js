const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { trackVoiceMinutes } = require('./statTracker');
const { log } = require('../utils/logger');

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_ANNOUNCE_CHANNEL_ID = process.env.MVP_ANNOUNCE_CHANNEL_ID || '583575179880431616';

let lastPrintedDate = null;

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

  await trackVoiceMinutes(memberId, durationMinutes);
  log(`📈 עדכון פעילות ל־${memberId}: ${durationMinutes} דקות`);
}
async function calculateAndAnnounceMVP(client, db, force = false) {
  const israelNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const today = israelNow.toISOString().split('T')[0];
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();

  if (!force && statusSnap.exists) {
    const alreadyToday = statusSnap.data().lastAnnouncedDate;
    if (alreadyToday === today) {
      log(`⛔ MVP כבר הוכרז היום (${alreadyToday}) – מתעלם`);
      return;
    }
  }

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
    const allMembers = await guild.members.fetch();
    allMembers.forEach(m => {
      if (m.roles.cache.has(mvpRole.id)) {
        m.roles.remove(mvpRole).catch(err =>
  log(`⚠️ שגיאה בהסרת תפקיד MVP מ־${m.user?.username}: ${err.message}`)
);
      }
    });
  } catch (err) {
    log(`⚠️ שגיאה בטעינת משתמשים: ${err.message}`);
  }

  await member.roles.add(mvpRole).catch(err =>
  log(`⚠️ שגיאה בהוספת תפקיד MVP ל־${member.user?.username}: ${err.message}`)
);

  const statsRef = db.doc(`mvpStats/${topUser.id}`);
  const statsSnap = await statsRef.get();
  const wins = statsSnap.exists ? (statsSnap.data().wins || 0) + 1 : 1;
  await statsRef.set({ wins });

  const imagePath = await renderMvpImage({
    username: member.displayName || member.user.username,
    avatarURL: member.displayAvatarURL({ extension: 'png', size: 512 }),
    minutes: topUser.minutes,
    wins
  });

  const channel = client.channels.cache.get(MVP_ANNOUNCE_CHANNEL_ID);
  if (!channel) return;

  // 🧹 מחיקת הודעת MVP קודמת
  if (statusSnap.exists) {
    const old = statusSnap.data();
    if (old.messageId && old.channelId) {
      const oldChannel = client.channels.cache.get(old.channelId);
      const oldMessage = await oldChannel?.messages?.fetch(old.messageId).catch(() => null);
      if (oldMessage) {
        await oldMessage.delete().catch(err =>
  log(`⚠️ שגיאה במחיקת הודעת MVP ישנה (${old.messageId}): ${err.message}`)
);
      }
    }
  }

  const message = await channel.send({
    content: '@everyone',
    files: [imagePath]
  }).catch(() => null);

  if (message) {
    await message.react('🏅').catch(() => {});
    await statusRef.set({
      lastCalculated: Timestamp.now(),
      lastAnnouncedDate: israelNow.toISOString().split('T')[0],
      messageId: message.id,
      channelId: channel.id,
      reacted: false
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

  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // זמן ישראל
  const todayDate = now.toISOString().split('T')[0];
  let lastDate = '1970-01-01';

  if (statusSnap.exists) {
    const statusData = statusSnap.data();
    lastDate = statusData.lastAnnouncedDate || lastDate;

    if (todayDate === lastDate) {
      const { messageId, channelId } = statusData;
      const channel = client.channels.cache.get(channelId);
      const message = await channel?.messages?.fetch(messageId).catch(() => null);
if (message) {
  if (lastPrintedDate !== todayDate) {
    log(`⏱️ כבר הוכרז היום – מדלג`);
    lastPrintedDate = todayDate;
  }
  return;
}

log(`⚠️ ההודעה המקורית נמחקה – מכריז מחדש`);
await calculateAndAnnounceMVP(client, db, true); // ← כאן נעביר force=true
return;
    }
  }

  const day = now.getDay(); // ראשון = 0
  if (day !== 0) return;

  if (lastPrintedDate !== todayDate) {
    log('⏳ יום ראשון – מנסה להכריז MVP...');
    lastPrintedDate = todayDate;
  }

  await calculateAndAnnounceMVP(client, db);
}



function startMvpScheduler(client, db) {
  setInterval(() => {
    checkMVPStatusAndRun(client, db);
  }, 60 * 1000); // בדיקה כל דקה
}

module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  startMvpScheduler
};

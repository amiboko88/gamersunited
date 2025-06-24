// 📁 voiceHandler.js – גרסה משודרגת עם תגובת יציאה וקטגוריה נוספת
const { processUserSmart, processUserExit } = require('./voiceQueue');
const { updateVoiceActivity } = require('./mvpTracker');
const {
  trackVoiceMinutes,
  trackJoinCount,
  trackJoinDuration,
  trackActiveHour
} = require('./statTracker');
const db = require('../utils/firebase');

const CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID;
const FIFO_ROLE_NAME = 'FIFO';
const EXTRA_CATEGORY_ID = '1138785781322887233'; // קטגוריית ערוצים נוספת

const joinTimestamps = new Map();

// 🧠 האם הערוץ נמצא ברשימת המעקב (FIFO או הקטגוריה)?
function channelIdIsMonitored(channelId, guild) {
  const chan = guild.channels.cache.get(channelId);
  return (
    channelId === CHANNEL_ID ||
    (chan?.parentId && chan.parentId === EXTRA_CATEGORY_ID)
  );
}

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const guild = member.guild;

  // התעלמות מ־AFK
  if (newChannelId === guild.afkChannelId || oldChannelId === guild.afkChannelId) return;

  console.log(`🎧 voiceStateUpdate – ${member.user.tag} עבר מ־${oldChannelId} ל־${newChannelId}`);

  // ניהול תפקיד FIFO
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
  if (fifoRole) {
    try {
      if (newChannelId === CHANNEL_ID && !member.roles.cache.has(fifoRole.id)) {
        await member.roles.add(fifoRole);
        console.log(`🎖️ ${member.user.tag} קיבל תפקיד FIFO`);
      }
      if (oldChannelId === CHANNEL_ID && newChannelId !== CHANNEL_ID && member.roles.cache.has(fifoRole.id)) {
        await member.roles.remove(fifoRole);
        console.log(`🚫 ${member.user.tag} איבד את תפקיד FIFO`);
      }
    } catch (err) {
      console.error('⚠️ שגיאה בטיפול בתפקיד FIFO:', err.message);
    }
  }
  const joined = !oldChannelId && newChannelId;
  const left = oldChannelId && !newChannelId;

  if (joined) {
    const timestamp = Date.now();
    joinTimestamps.set(userId, timestamp);
    await db.collection('voiceEntries').doc(userId).set({ joinedAt: timestamp });
  }

  if (left) {
    const now = Date.now();
    let joinedAt = joinTimestamps.get(userId);
    if (!joinedAt) {
      const doc = await db.collection('voiceEntries').doc(userId).get();
      joinedAt = doc.exists ? doc.data().joinedAt : null;
    }
    if (!joinedAt) joinedAt = now - 60000;

    const durationMs = now - joinedAt;
    const durationMinutes = Math.max(1, Math.round(durationMs / 1000 / 60));

    if (durationMinutes > 0 && durationMinutes < 600) {
      await updateVoiceActivity(userId, durationMinutes, db);
      await trackVoiceMinutes(userId, durationMinutes);
      await trackJoinCount(userId);
      await trackJoinDuration(userId, durationMinutes);
      await trackActiveHour(userId);
      await db.collection('voiceTime').add({ userId, minutes: durationMinutes, date: new Date() });
      await db.collection('memberTracking').doc(userId).set({
        lastActivity: new Date().toISOString(),
        activityWeight: 2
      }, { merge: true });

      console.log(`📈 ${member.user.tag} עודכן – ${durationMinutes} דקות`);
    }

    joinTimestamps.delete(userId);
    await db.collection('voiceEntries').doc(userId).delete().catch(() => {});

    // 🗣️ תגובה ליציאה מערוץ קול אם זה ערוץ במעקב
    if (channelIdIsMonitored(oldChannelId, guild)) {
      await processUserExit(member, oldState.channel);
    }
  }

  // 🎙️ תגובה לכניסה לערוץ קול בפיקוח (FIFO או הקטגוריה)
  if (newChannelId && channelIdIsMonitored(newChannelId, guild)) {
    const channel = newState.channel;
    if (channel) {
      await processUserSmart(member, channel);
    }
  }
}

module.exports = {
  handleVoiceStateUpdate
};

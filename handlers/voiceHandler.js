// 📁 voiceHandler.js
const { processUserSmart } = require('./voiceQueue');
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

const joinTimestamps = new Map();

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  const joined = !oldChannelId && newChannelId;
  const left = oldChannelId && !newChannelId;

  console.log(`🎧 voiceStateUpdate – ${member.user.tag} עבר מ־${oldChannelId} ל־${newChannelId}`);

  const guild = member.guild;
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);

  // 🎖️ ניהול תפקיד FIFO
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

  // ✅ רישום זמן כניסה – רק אם נכנס לאיזשהו ערוץ קול
  if (joined) {
    const timestamp = Date.now();
    joinTimestamps.set(userId, timestamp);
    await db.collection('voiceEntries').doc(userId).set({ joinedAt: timestamp });
  }

  // ✅ רישום זמן יציאה – גם אם לא היה בזיכרון (נשלוף מ־DB)
  if (left) {
    const now = Date.now();
    let joinedAt = joinTimestamps.get(userId);

    if (!joinedAt) {
      const doc = await db.collection('voiceEntries').doc(userId).get();
      joinedAt = doc.exists ? doc.data().joinedAt : null;
    }

    if (!joinedAt) {
      console.warn(`⚠️ לא נמצא זמן כניסה בזיכרון או DB עבור ${member.user.tag} – מניח 1 דקה`);
      joinedAt = now - 60000;
    }

    const durationMs = now - joinedAt;
    const durationMinutes = Math.max(1, Math.round(durationMs / 1000 / 60));

    if (durationMinutes > 0 && durationMinutes < 600) {
      await updateVoiceActivity(userId, durationMinutes, db);
      await trackVoiceMinutes(userId, durationMinutes);
      await trackJoinCount(userId);
      await trackJoinDuration(userId, durationMinutes);
      await trackActiveHour(userId);

      await db.collection('memberTracking').doc(userId).set({
        lastActivity: new Date().toISOString(),
        activityWeight: 2
      }, { merge: true });

      console.log(`📈 ${member.user.tag} עודכן במערכת – ${durationMinutes} דקות`);
    } else {
      console.log(`⚠️ ${member.user.tag} – משך לא תקין (חושב ${durationMinutes} דקות, ${durationMs}ms)`);
    }

    joinTimestamps.delete(userId);
    await db.collection('voiceEntries').doc(userId).delete().catch(() => {});
  }

  // 📥 טיפול חכם כשנכנס לערוץ FIFO
  if (newChannelId === CHANNEL_ID && oldChannelId !== newChannelId) {
    const channel = newState.channel;
    if (channel) {
      await processUserSmart(member, channel);
    }
  }
}

module.exports = {
  handleVoiceStateUpdate
};

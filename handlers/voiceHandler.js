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

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

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

  // ✅ רישום זמן כניסה
  if (newChannelId === CHANNEL_ID && oldChannelId !== newChannelId) {
    console.log(`📢 ${member.user.tag} נכנס לערוץ TTS`);
    joinTimestamps.set(member.id, Date.now());

    const channel = newState.channel;
    if (channel) {
      await processUserSmart(member, channel);
    }
  }

  // ✅ רישום זמן יציאה ועדכון סטטיסטיקות
  if (oldChannelId === CHANNEL_ID && newChannelId !== CHANNEL_ID) {
    const joinedAt = joinTimestamps.get(member.id) || Date.now();
    const now = Date.now();
    const durationMinutes = Math.round((now - joinedAt) / 1000 / 60);

    if (durationMinutes > 0 && durationMinutes < 600) {
      await updateVoiceActivity(member.id, durationMinutes, db);
      await trackVoiceMinutes(member.id, durationMinutes);
      await trackJoinCount(member.id);
      await trackJoinDuration(member.id, durationMinutes);
      await trackActiveHour(member.id);
      console.log(`📈 ${member.user.tag} עודכן במערכת – ${durationMinutes} דקות`);
    } else {
      console.log(`⚠️ ${member.user.tag} – משך לא תקין (${durationMinutes} דקות)`);
    }

    joinTimestamps.delete(member.id);
  }
}

module.exports = {
  handleVoiceStateUpdate
};

// 📁 handlers/voiceHandler.js – ניהול כניסות לערוצים והשמעת TTS + תפקיד FIFO

const { processUserSmart } = require('./voiceQueue'); // ✅ שימוש בתור חכם
const TARGET_CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID;
const FIFO_CHANNEL_ID = '1372282634482352128'; // ⬅️ החלף ל־ID האמיתי של ערוץ FIFO
const FIFO_ROLE_NAME = 'FIFO';

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // ✅ זיהוי ערוץ TTS לצורך השמעה חכמה
  if (newChannelId === TARGET_CHANNEL_ID && oldChannelId !== newChannelId) {
    const channel = newState.channel;
    if (channel) await processUserSmart(member, channel);
  }

  // ✅ ניהול תפקיד FIFO
  const guild = member.guild;
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
  if (!fifoRole) return;

  try {
    // ⬅️ כניסה לערוץ FIFO – מעניק תפקיד אם אין
    if (newChannelId === FIFO_CHANNEL_ID && !member.roles.cache.has(fifoRole.id)) {
      await member.roles.add(fifoRole);
      console.log(`🎖️ ${member.user.tag} קיבל תפקיד FIFO`);
    }

    // ⬅️ יציאה מערוץ FIFO – מסיר תפקיד אם לא עבר לערוץ אחר
    if (oldChannelId === FIFO_CHANNEL_ID && newChannelId !== FIFO_CHANNEL_ID && member.roles.cache.has(fifoRole.id)) {
      await member.roles.remove(fifoRole);
      console.log(`🚫 ${member.user.tag} איבד את תפקיד FIFO`);
    }
  } catch (err) {
    console.error('⚠️ שגיאה בטיפול בתפקיד FIFO:', err.message);
  }
}

module.exports = {
  handleVoiceStateUpdate
};

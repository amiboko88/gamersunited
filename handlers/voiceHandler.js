// 📁 handlers/voiceHandler.js – ניהול כניסות לערוצים והשמעת TTS

const { processUserSmart } = require('./voiceQueue'); // ✅ שימוש בתור חכם
const TARGET_CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID;

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  const channel = newState.channel;

  if (!channel || channel.id !== TARGET_CHANNEL_ID) return;
  if (oldState.channelId === newState.channelId) return;
  if (member.user.bot) return;

  await processUserSmart(member, channel);
}

module.exports = {
  handleVoiceStateUpdate
};

// 📁 handlers/voiceHandler.js – ניהול TTS ותפקיד FIFO בערוץ קול (גרסת DEBUG)

const { processUserSmart } = require('./voiceQueue');

const CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID;
const FIFO_ROLE_NAME = 'FIFO';

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  console.log(`🎧 voiceStateUpdate – ${member.user.tag} עבר מ־${oldChannelId} ל־${newChannelId}`);

  // תפקיד FIFO
  const guild = member.guild;
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

  // כניסה לערוץ TTS
  if (newChannelId === CHANNEL_ID && oldChannelId !== newChannelId) {
    console.log(`📢 ${member.user.tag} נכנס לערוץ TTS (${CHANNEL_ID})`);
    const channel = newState.channel;
    if (channel) {
      await processUserSmart(member, channel);
    }
  }
}

module.exports = {
  handleVoiceStateUpdate
};

// 📁 handlers/voiceHandler.js – ניהול TTS ותפקיד FIFO בערוץ קול יחיד

const { processUserSmart } = require('./voiceQueue');

const CHANNEL_ID = '1231453923387379783'; // כאן שמים את ה-ID של ערוץ הקול שלך
const FIFO_ROLE_NAME = 'FIFO';

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // ניהול תפקיד FIFO – לכל מי שבערוץ הקול הזה
  const guild = member.guild;
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
  if (fifoRole) {
    try {
      // מעניק תפקיד בכניסה
      if (newChannelId === CHANNEL_ID && !member.roles.cache.has(fifoRole.id)) {
        await member.roles.add(fifoRole);
        console.log(`🎖️ ${member.user.tag} קיבל תפקיד FIFO`);
      }
      // מסיר תפקיד ביציאה
      if (oldChannelId === CHANNEL_ID && newChannelId !== CHANNEL_ID && member.roles.cache.has(fifoRole.id)) {
        await member.roles.remove(fifoRole);
        console.log(`🚫 ${member.user.tag} איבד את תפקיד FIFO`);
      }
    } catch (err) {
      console.error('⚠️ שגיאה בטיפול בתפקיד FIFO:', err.message);
    }
  }

  // טריגר TTS (שמעון) – כל כניסה לערוץ הקול (לא תלוי תפקיד!)
  if (newChannelId === CHANNEL_ID && oldChannelId !== newChannelId) {
    const channel = newState.channel;
    if (channel) await processUserSmart(member, channel);
  }
}

module.exports = {
  handleVoiceStateUpdate
};

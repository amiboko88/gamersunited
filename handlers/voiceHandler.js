// 📁 voiceHandler.js – FIFO SMART TTS ENGINE
const { getShortTTSByProfile, getPodcastAudioGemini } = require('../tts/ttsEngine.gemini');
const { shouldUseFallback } = require('../tts/ttsQuotaManager');
const { createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');

const FIFO_CHANNEL_ID = '1231453923387379783';
const queue = new Map();

// בדיקת כניסה תקפה לחדר FIFO
function isValidJoin(oldState, newState) {
  return oldState.channelId !== FIFO_CHANNEL_ID && newState.channelId === FIFO_CHANNEL_ID;
}

// זיהוי קרציות (כניסה-יציאה תוך 30 שניות)
function isCratz(userId) {
  const now = Date.now();
  const last = queue.get(userId);
  queue.set(userId, now);
  return last && now - last < 30000;
}

// עיכוב פשוט
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// נגינת TTS ב־Voice Channel
async function playTTS(connection, buffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(buffer);
  connection.subscribe(player);
  player.play(resource);

  await entersState(player, AudioPlayerStatus.Playing, 5000);
  return new Promise(resolve => {
    player.on(AudioPlayerStatus.Idle, resolve);
  });
}

// תהליך מלא עבור משתמש
async function processUser(user, guild) {
  const voiceChannel = guild.channels.cache.get(FIFO_CHANNEL_ID);
  if (!voiceChannel) return;

  const connection = joinVoiceChannel({
    channelId: FIFO_CHANNEL_ID,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5000);

    const fallback = await shouldUseFallback();
    const chance = Math.random();

    let buffers;
    if (fallback || chance < 0.3) {
      buffers = await getPodcastAudioGemini(user.id); // פודקאסט
    } else {
      const buffer = await getShortTTSByProfile(user.id); // משפט קצר
      buffers = [buffer];
    }

    for (const buf of buffers) {
      await playTTS(connection, buf);
      await delay(1000); // השהיה בין קטעים
    }

  } catch (err) {
    console.error('TTS error:', err);
  } finally {
    connection.destroy();
  }
}

// יצוא ל־Discord.js
module.exports = {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState, newState) {
    if (!isValidJoin(oldState, newState)) return;

    const user = newState.member.user;
    const guild = newState.guild;

    if (isCratz(user.id)) return;

    setTimeout(() => processUser(user, guild), 3000); // שיהוי חכם
  }
};

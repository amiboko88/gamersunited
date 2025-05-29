// 📁 handlers/voiceQueue.js – ניהול חכם של תור TTS, קרציות, פודקאסטים ועוד

const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { getShortTTSByProfile, getPodcastAudioGemini } = require('../tts/ttsEngine.gemini');
const { shouldUseFallback } = require('../tts/ttsQuotaManager');

const activeQueue = new Map();
const recentUsers = new Map();
const connectionLocks = new Set();
const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10_000;
const MULTI_JOIN_WINDOW = 6_000;
const BONUS_MIN_COUNT = 3;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playAudio(connection, audioBuffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(audioBuffer);
  connection.subscribe(player);
  player.play(resource);

  try {
    await entersState(player, AudioPlayerStatus.Idle, 30_000);
  } catch (err) {
    console.error('🛑 השמעה נכשלה:', err);
  }

  player.stop();
  connection.destroy();
}

function isUserAnnoying(userId) {
  const now = Date.now();
  const timestamps = recentUsers.get(userId) || [];
  const newTimestamps = [...timestamps.filter(t => now - t < CRITICAL_SPAM_WINDOW), now];
  recentUsers.set(userId, newTimestamps);
  return newTimestamps.length >= 3;
}

async function processUserSmart(member, channel) {
  const userId = member.id;
  const guildId = channel.guild.id;
  const key = `${guildId}-${channel.id}`;

  if (!activeQueue.has(key)) activeQueue.set(key, []);
  const queue = activeQueue.get(key);

  queue.push({ member, timestamp: Date.now() });

  if (connectionLocks.has(key)) return; // Already processing

  connectionLocks.add(key);

  while (queue.length > 0) {
    const { member: nextMember, timestamp } = queue.shift();

    if (isUserAnnoying(nextMember.id)) {
      console.log(`🤬 ${nextMember.displayName} מתנהג כמו קרצייה`);
      continue;
    }

    const joinedClose = queue.some(item =>
      item.member.id !== nextMember.id &&
      Math.abs(item.timestamp - timestamp) <= MULTI_JOIN_WINDOW
    );

    const usePodcast = joinedClose;
    const useFallback = await shouldUseFallback();
    let audioBuffer;

    try {
      audioBuffer = usePodcast
        ? await getPodcastAudioGemini(queue.map(item => item.member.displayName))
        : await getShortTTSByProfile(nextMember, useFallback);
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      await playAudio(connection, audioBuffer);
    } catch (err) {
      console.error('🔌 שגיאה בהשמעה:', err);
    }

    await wait(TTS_TIMEOUT);
  }

  connectionLocks.delete(key);
}

module.exports = {
  processUserSmart
};

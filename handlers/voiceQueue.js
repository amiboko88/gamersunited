// 📁 handlers/voiceQueue.js – FIFO TTS: תור, פודקאסטים, OpenAI בלבד, Buffer נקי

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');

const {
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  canUserUseTTS
} = require('../tts/ttsEngine.openai');

const activeQueue = new Map();
const recentUsers = new Map();
const connectionLocks = new Set();
const channelConnections = new Map();

const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10000;
const MULTI_JOIN_WINDOW = 6000;
const GROUP_MIN = 3;
const SHIMON_COOLDOWN = 45000;
const CONNECTION_IDLE_TIMEOUT = 60000;

async function getOrCreateConnection(channel) {
  let record = channelConnections.get(channel.id);
  const now = Date.now();
  if (record && record.connection && record.lastUsed && (now - record.lastUsed < CONNECTION_IDLE_TIMEOUT)) {
    record.lastUsed = now;
    return record.connection;
  }
  if (record && record.connection) {
    try { record.connection.destroy(); } catch (e) {}
  }
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator
  });
  channelConnections.set(channel.id, { connection, lastUsed: now });
  return connection;
}

setInterval(() => {
  const now = Date.now();
  for (const [channelId, record] of channelConnections) {
    if (now - record.lastUsed > CONNECTION_IDLE_TIMEOUT) {
      try { record.connection.destroy(); } catch (e) {}
      channelConnections.delete(channelId);
    }
  }
}, 20000);

async function playAudio(connection, audioBuffer) {
  try {
    if (!Buffer.isBuffer(audioBuffer)) {
      console.error('🛑 Buffer לא תקין!', typeof audioBuffer, audioBuffer);
      return;
    }
    console.log(`🔊 משמיע אודיו (${audioBuffer.length} bytes)`); // לוג חדש
    let resource = createAudioResource(audioBuffer);
    let player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Idle, 15000);
    if (player) player.stop();
  } catch (err) {
    console.error('🛑 השמעה נכשלה – exception:', err.message);
  }
}

// זיהוי קרציות
function isUserAnnoying(userId) {
  const now = Date.now();
  const timestamps = recentUsers.get(userId) || [];
  const newTimestamps = [...timestamps.filter(t => now - t < CRITICAL_SPAM_WINDOW), now];
  recentUsers.set(userId, newTimestamps);
  return newTimestamps.length >= 3;
}

// ניהול תדירות שמעון
function shouldShimonSpeak(channelId) {
  return true; // ביטול זמני של Cooldown
}

function markShimonSpoken(channelId) {
  recentUsers.set('shimon-last-spoken-' + channelId, Date.now());
}

async function processUserSmart(member, channel) {
  const userId = member.id;
  const guildId = channel.guild.id;
  const key = `${guildId}-${channel.id}`;

  if (!activeQueue.has(key)) activeQueue.set(key, []);
  const queue = activeQueue.get(key);

  queue.push({ member, timestamp: Date.now() });

  if (connectionLocks.has(key)) return;
  connectionLocks.add(key);

  while (queue.length > 0) {
    const now = Date.now();
    const batch = [queue.shift()];
    while (queue.length > 0 && (queue[0].timestamp - batch[0].timestamp) <= MULTI_JOIN_WINDOW) {
      batch.push(queue.shift());
    }

    const userIds = batch.map(x => x.member.id);
    const displayNames = batch.map(x => x.member.displayName);

    if (userIds.some(isUserAnnoying)) continue;

    let blocked = false;
    for (const user of batch) {
      if (!(await canUserUseTTS(user.member.id, 10))) blocked = true;
    }
    if (blocked) continue;

    const usePodcast = batch.length >= GROUP_MIN;
    if (!shouldShimonSpeak(channel.id)) {
  console.log(`⏳ שמעון עדיין ב־Cooldown`);
  continue;
}

    let audioBuffer;
    try {
      if (usePodcast) {
        audioBuffer = await getPodcastAudioOpenAI(displayNames, userIds);
      } else {
        audioBuffer = await getShortTTSByProfile(batch[0].member);
        if (!Buffer.isBuffer(audioBuffer)) throw new Error('Single TTS audioBuffer אינו Buffer');
      }
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    try {
      const connection = await getOrCreateConnection(channel);
      await playAudio(connection, audioBuffer);
      markShimonSpoken(channel.id);
    } catch (err) {
      console.error('🔌 שגיאה בהשמעה:', err);
    }

    await wait(TTS_TIMEOUT);
  }

  connectionLocks.delete(key);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processUserSmart
};

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
  console.log(`➡️ הוסף ל־TTS Queue: ${member.user.tag}`);

  if (connectionLocks.has(key)) {
    console.log(`⏳ חיבור פעיל קיים – ממתין`);
    return;
  }
  connectionLocks.add(key);

  while (queue.length > 0) {
    const now = Date.now();
    const batch = [queue.shift()];
    while (queue.length > 0 && (queue[0].timestamp - batch[0].timestamp) <= MULTI_JOIN_WINDOW) {
      batch.push(queue.shift());
    }

    const userIds = batch.map(x => x.member.id);
    const displayNames = batch.map(x => x.member.displayName);

    console.log(`📦 TTS Batch: ${displayNames.join(', ')}`);

    // חסימת קרציות
    if (userIds.some(isUserAnnoying)) {
      console.log(`❌ חסימת קרציות`);
      continue;
    }

    // נטרול זמני של בקרת שימוש
    let blocked = false;
    for (const user of batch) {
      const ok = await canUserUseTTS(user.member.id, 10);
      if (!ok) blocked = true;
    }
    if (blocked) {
      console.log(`⛔ חסימה לפי שימוש`);
      continue;
    }

    // דיבור קבוצתי או אישי
    const usePodcast = batch.length >= GROUP_MIN;
    console.log(`🧠 שימוש ב־${usePodcast ? 'Podcast' : 'Single'}`);

    let audioBuffer;

    try {
      if (usePodcast) {
        audioBuffer = await getPodcastAudioOpenAI(displayNames, userIds);
      } else {
        audioBuffer = await getShortTTSByProfile(batch[0].member);
      }
    } catch (err) {
      console.error(`❌ שגיאה ב־TTS`, err);
      continue;
    }

    if (!Buffer.isBuffer(audioBuffer)) {
      console.error('🛑 Buffer לא חוקי:', audioBuffer);
      continue;
    }

    try {
      const connection = await getOrCreateConnection(channel);
      console.log(`🔊 משמיע אודיו (${audioBuffer.length} bytes)`);
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

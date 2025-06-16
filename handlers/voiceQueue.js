const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType
} = require('@discordjs/voice');
const { Readable } = require('stream');
const {
  getShortTTSByProfile,
  getPodcastAudioAzure,
  canUserUseTTS
} = require('../tts/ttsEngine.azure');

const channelConnections = new Map();
const connectionLocks = new Set();
const activeQueue = new Map();
const recentUsers = new Map();

const TTS_TIMEOUT = 3500;
const GROUP_MIN = 2;
const CONNECTION_IDLE_TIMEOUT = 60000;

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function getOrCreateConnection(channel) {
  const now = Date.now();
  const record = channelConnections.get(channel.id);

  if (record?.connection && now - record.lastUsed < CONNECTION_IDLE_TIMEOUT) {
    record.lastUsed = now;
    return record.connection;
  }

  if (record?.connection) {
    try { record.connection.destroy(); } catch {}
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 5000);
  console.log('✅ התחבר לערוץ קול');

  channelConnections.set(channel.id, { connection, lastUsed: now });
  return connection;
}

setInterval(() => {
  const now = Date.now();
  for (const [channelId, record] of channelConnections) {
    if (now - record.lastUsed > CONNECTION_IDLE_TIMEOUT) {
      try { record.connection.destroy(); } catch {}
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

    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);

    console.log(`🔊 השמעה התחילה (גודל: ${audioBuffer.length} bytes)`);

    await entersState(player, AudioPlayerStatus.Idle, 15000);
    if (player) player.stop();
  } catch (err) {
    console.error('🛑 השמעה נכשלה – exception:', err.message);
  }
}

function isUserAnnoying(userId) {
  const key = `spam-${userId}`;
  const timestamps = recentUsers.get(key) || [];
  const now = Date.now();
  const newTimestamps = timestamps.filter(t => now - t < 30000);
  newTimestamps.push(now);
  recentUsers.set(key, newTimestamps);
  return newTimestamps.length >= 3;
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
    const batch = queue.splice(0);
    const userIds = batch.map(x => x.member.id);
    const displayNames = batch.map(x => x.member.displayName);
    const joinTimestamps = Object.fromEntries(batch.map(x => [x.member.id, x.timestamp]));

    console.log(`📦 TTS Batch: ${displayNames.join(', ')}`);

    if (userIds.some(isUserAnnoying)) {
      console.log(`❌ חסימת קרציות`);
      continue;
    }

    let blocked = false;
    for (const user of batch) {
      const ok = await canUserUseTTS(user.member.id, 10);
      if (!ok) blocked = true;
    }
    if (blocked) {
      console.log(`⛔ חסימה לפי שימוש`);
      continue;
    }

    const usePodcast = batch.length >= GROUP_MIN;
    console.log(`🧠 שימוש ב־${usePodcast ? 'Podcast' : 'Single'}`);

    let audioBuffer;

    try {
      if (usePodcast) {
        audioBuffer = await getPodcastAudioAzure(displayNames, userIds, joinTimestamps);
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

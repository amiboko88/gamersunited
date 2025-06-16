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
  if (!Buffer.isBuffer(audioBuffer)) return;

  const stream = Readable.from(audioBuffer);
  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
  const player = createAudioPlayer();
  connection.subscribe(player);
  player.play(resource);

  try {
    await entersState(player, AudioPlayerStatus.Idle, 15000);
  } catch {}
  player.stop();
}

async function processUserSmart(member, channel) {
  const userId = member.id;
  const guildId = channel.guild.id;
  const key = `${guildId}-${channel.id}`;

  const allowed = await canUserUseTTS(userId);
  if (!allowed) return;

  if (!activeQueue.has(key)) activeQueue.set(key, []);
  const queue = activeQueue.get(key);
  queue.push({ member, timestamp: Date.now() });

  if (connectionLocks.has(key)) {
    console.warn(`⚠️ חיבור כבר קיים ל־${key} — לא ממשיכים`);
    return;
  }

  connectionLocks.add(key);

  try {
    while (queue.length > 0) {
      const batch = queue.splice(0);
      const userIds = batch.map(x => x.member.id);
      const displayNames = batch.map(x => x.member.displayName);
      const joinTimestamps = Object.fromEntries(batch.map(x => [x.member.id, x.timestamp]));

      let audioBuffer;
      try {
        const usePodcast = batch.length >= GROUP_MIN;
        audioBuffer = usePodcast
          ? await getPodcastAudioAzure(displayNames, userIds, joinTimestamps)
          : await getShortTTSByProfile(batch[0].member);
      } catch (err) {
        console.error(`❌ שגיאה בהפקת TTS:`, err.message);
        continue;
      }

      if (!Buffer.isBuffer(audioBuffer)) {
        console.error('🛑 Buffer לא חוקי:', typeof audioBuffer);
        continue;
      }

      try {
        const connection = await getOrCreateConnection(channel);
        console.log(`🔊 שמעון מדבר עם ${displayNames.join(', ')}`);
        await playAudio(connection, audioBuffer);
      } catch (err) {
        console.error(`🔌 שגיאה בהשמעה:`, err.message);
      }

      await wait(TTS_TIMEOUT);
    }
  } finally {
    connectionLocks.delete(key);
    console.log(`🔓 lock שוחרר ל־${key}`);
  }
}

module.exports = {
  processUserSmart
};

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
  canUserUseTTS
} = require('../tts/ttsEngine.azure');

const recentJoins = new Map(); // userId => timestamp
const lastPlayed = new Map();  // userId => timestamp
const CONNECTION_IDLE_TIMEOUT = 60000;
const USER_COOLDOWN = 45000;

const channelConnections = new Map();

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
  const stream = Readable.from(audioBuffer);
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  let played = false;

  player.on(AudioPlayerStatus.Playing, () => {
    played = true;
    console.log('🔊 שמעון התחיל לדבר');
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('✅ שמעון סיים לדבר');
  });

  player.on('error', (err) => {
    console.error('💥 שגיאת נגן שמעון:', err.message);
  });

  try {
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Idle, 15000);
  } catch (e) {
    console.warn('⚠️ שמעון לא הגיע למצב Idle:', e.message);
  }

  try {
    player.stop();
  } catch {}
}

async function processUserSmart(member, channel) {
  const now = Date.now();
  const userId = member.id;
  const lastSpeak = lastPlayed.get(userId) || 0;

  recentJoins.set(userId, now);

  if (now - lastSpeak < USER_COOLDOWN) {
    console.log(`🤐 ${member.displayName} עדיין בקולדאון`);
    return;
  }

  const allowed = await canUserUseTTS(userId);
  if (!allowed) {
    console.log(`🚫 ${member.displayName} לא מורשה ל־TTS`);
    return;
  }

  let buffer;
  try {
    buffer = await getShortTTSByProfile(member);
  } catch (err) {
    console.error(`❌ שגיאה בהפקת TTS ל־${member.displayName}: ${err.message}`);
    return;
  }

  let connection;
  try {
    connection = await getOrCreateConnection(channel);
  } catch (err) {
    console.error(`❌ שגיאה ביצירת connection: ${err.message}`);
    return;
  }

  try {
    console.log(`🎤 שמעון מדבר עם ${member.displayName}`);
    await playAudio(connection, buffer);
    lastPlayed.set(userId, now); // ⬅️ נשמר רק אם הצליח!
  } catch (err) {
    console.error(`💥 שגיאה בהשמעה ל־${member.displayName}: ${err.message}`);
  }
}

module.exports = {
  processUserSmart
};

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
  console.log(`🎤 מנסה להתחבר לערוץ ${channel.name} (${channel.id})`);

  const now = Date.now();
  const record = channelConnections.get(channel.id);

  if (record?.connection && now - record.lastUsed < CONNECTION_IDLE_TIMEOUT) {
    record.lastUsed = now;
    return record.connection;
  }

  if (record?.connection) {
    try { record.connection.destroy(); } catch {}
  }

  // ✅ הפקת adapter ישירות מה־channel בצורה מאובטחת
  const adapterCreator = channel?.guild?.voiceAdapterCreator;
  if (typeof adapterCreator !== 'function') {
    console.error(`❌ voiceAdapterCreator חסר או לא תקף עבור guild ${channel.guild?.id}`);
    throw new Error('voiceAdapterCreator is not available');
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: adapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
    console.log('✅ התחבר לערוץ קול');
  } catch (err) {
    console.error('❌ נכשל להתחבר לערוץ קול:', err.message);
    throw err;
  }

  channelConnections.set(channel.id, { connection, lastUsed: now });
  return connection;
}


// ניקוי חיבורים לא פעילים כל 20 שניות
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

  player.on(AudioPlayerStatus.Playing, () => {
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
    await entersState(player, AudioPlayerStatus.Playing, 5_000);
    await entersState(player, AudioPlayerStatus.Idle, 15_000);
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
    console.error(`❌ לא הצלחנו להתחבר לערוץ עבור ${member.displayName}: ${err.message}`);
    return;
  }

  try {
    console.log(`🎤 שמעון מדבר עם ${member.displayName}`);
    await playAudio(connection, buffer);
    lastPlayed.set(userId, now);
  } catch (err) {
    console.error(`💥 שגיאה בהשמעה ל־${member.displayName}: ${err.message}`);
  }
}

module.exports = {
  processUserSmart
};

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { Readable } = require('stream');

const {
  getShortTTSByProfile,
  getPodcastAudioAzure,
  canUserUseTTS
} = require('../tts/ttsEngine.azure'); // 👈 שימוש במנוע החדש

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
  if (record && record.connection && now - record.lastUsed < CONNECTION_IDLE_TIMEOUT) {
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
  console.log('🔔 נכנס ל־playAudio() – התחלה');

  if (!Buffer.isBuffer(audioBuffer)) {
    console.error('🛑 Buffer לא תקין או לא קיים!');
    return;
  }

  const stream = Readable.from(audioBuffer);
  const resource = createAudioResource(stream);
  const player = createAudioPlayer();
  let played = false;

  player.on(AudioPlayerStatus.Playing, () => {
    played = true;
    console.log('🔊 AudioPlayer במצב Playing – שמעון התחיל לדבר');
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('✅ AudioPlayer במצב Idle – שמעון סיים לדבר');
  });

  player.on('error', (err) => {
    console.error('💥 שגיאה בהשמעה:', err.message);
  });

  try {
    console.log('🎧 מנסה לחבר את player לערוץ...');
    connection.subscribe(player);

    console.log('▶️ קורא player.play(resource)...');
    player.play(resource);

    console.log('⏳ ממתין ל־AudioPlayerStatus.Idle...');
    await entersState(player, AudioPlayerStatus.Idle, 15000);
    console.log('🏁 ההשמעה הסתיימה (Idle)');
  } catch (e) {
    console.error('⛔ Timeout או תקלה ב־entersState:', e.message);

    // 🟡 אופציונלי – שלח ל־STAFF אם יש ערוץ מוגדר
    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    const guild = connection.joinConfig?.guild;
    const staffChannel = guild?.channels?.cache?.get?.(staffChannelId);

    if (staffChannel?.isTextBased?.()) {
      staffChannel.send(`⚠️ **בעיה בהשמעת שמעון** – תקלה ב־entersState.`);
    }
  }

  if (!played) {
    console.warn('🤐 שמעון לא התחיל לדבר בכלל!');
    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    const guild = connection.joinConfig?.guild;
    const staffChannel = guild?.channels?.cache?.get?.(staffChannelId);

    if (staffChannel?.isTextBased?.()) {
      staffChannel.send(`⚠️ **שמעון לא התחיל לדבר בכלל** – buffer נשלח אך לא הושמע.`);
    }
  }

  try {
    player.stop();
    console.log('🛑 AudioPlayer הופסק ידנית');
  } catch (err) {
    console.warn('⚠️ שגיאה בעצירת AudioPlayer:', err.message);
  }
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
  console.log(`🎤 הוסף ל־Queue: ${member.displayName}`);
  console.log(`📊 Queue נוכחי (${key}):`, queue.map(x => x.member.displayName));

  if (connectionLocks.has(key)) {
    console.log(`🔒 דילוג – כבר פועל נגן עבור ${key}`);
    return;
  }

  connectionLocks.add(key);

  try {
    while (queue.length > 0) {
      const now = Date.now();
      const batch = [queue.shift()];

      while (queue.length > 0 && (queue[0].timestamp - batch[0].timestamp) <= MULTI_JOIN_WINDOW) {
        batch.push(queue.shift());
      }

      const userIds = batch.map(x => x.member.id);
      const displayNames = batch.map(x => x.member.displayName);
      const joinTimestamps = Object.fromEntries(batch.map(x => [x.member.id, x.timestamp]));

      if (userIds.some(isUserAnnoying)) {
        console.log(`🚫 קרציות נחסמות`);
        continue;
      }

      const allowed = await Promise.all(userIds.map(id => canUserUseTTS(id)));
      if (allowed.includes(false)) continue;

      const usePodcast = batch.length >= GROUP_MIN;
      let buffer;

      try {
        buffer = usePodcast
          ? await getPodcastAudioAzure(displayNames, userIds, joinTimestamps)
          : await getShortTTSByProfile(batch[0].member);
      } catch (err) {
        console.error(`❌ שגיאה בהפקת TTS: ${err.message}`);
        continue;
      }

      try {
        const connection = await getOrCreateConnection(channel);
        await playAudio(connection, buffer);
      } catch (err) {
        console.error(`🔌 שגיאה בחיבור קול או בהשמעה: ${err.message}`);
      }

      await wait(TTS_TIMEOUT);
    }
  } finally {
    connectionLocks.delete(key);
    console.log(`🔓 שוחרר lock עבור ${key}`);
  }
}


function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processUserSmart
};

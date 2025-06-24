// 📁 voiceQueue.js – גרסה סופית עם ping, volume, podcast ועוד
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const {
  getShortTTSByProfile,
  getPodcastAudioEleven,
  canUserUseTTS
} = require('../tts/ttsEngine.elevenlabs');

const CONNECTION_IDLE_TIMEOUT = 60000;
const MULTI_JOIN_WINDOW = 12000;
const TTS_TIMEOUT = 5000;
const GROUP_MIN = 2;

const activeQueue = new Map();
const connectionLocks = new Set();
const channelConnections = new Map();

async function getOrCreateConnection(channel) {
  const now = Date.now();
  let record = channelConnections.get(channel.id);

  if (record && now - record.lastUsed < CONNECTION_IDLE_TIMEOUT) {
    record.lastUsed = now;
    return record.connection;
  }

  if (record?.connection) {
    try { record.connection.destroy(); } catch {}
  }

  console.log(`🎧 מנסה להתחבר לערוץ ${channel.name} (${channel.id})`);

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
      try { record.connection.destroy(); } catch {}
      channelConnections.delete(channelId);
    }
  }
}, 20000);
async function playAudio(connection, audioBuffer, displayName) {
  const player = createAudioPlayer();
  connection.subscribe(player);

  // 🔔 ניגון קובץ פתיחה (xbox ping)
  try {
    const pingPath = path.join(__dirname, '../assets/xbox.mp3');
    if (fs.existsSync(pingPath)) {
      const pingResource = createAudioResource(pingPath);
      player.play(pingResource);
      await entersState(player, AudioPlayerStatus.Idle, 3000);
    }
  } catch (e) {
    console.warn(`⚠️ שגיאה בניגון ping: ${e.message}`);
  }

  // 🗣️ השמעת תוכן שמעון עם הגברה
  try {
    const stream = Readable.from(audioBuffer);
    const ttsResource = createAudioResource(stream, { inlineVolume: true });
    ttsResource.volume.setVolume(1.5);
    player.play(ttsResource);
    await entersState(player, AudioPlayerStatus.Idle, 15000);
  } catch (err) {
    console.error(`⛔ שגיאה בהשמעת שמעון: ${err.message}`);
  }

  player.stop();
}

async function processUserSmart(member, channel) {
  const key = `${channel.guild.id}-${channel.id}`;
  if (!activeQueue.has(key)) activeQueue.set(key, []);
  const queue = activeQueue.get(key);

  queue.push({ member, timestamp: Date.now() });
  console.log(`🎤 הוסף ל־Queue: ${member.displayName}`);

  if (connectionLocks.has(key)) return;
  connectionLocks.add(key);

  while (queue.length > 0) {
    const batch = [queue.shift()];
    while (queue.length > 0 && queue[0].timestamp - batch[0].timestamp <= MULTI_JOIN_WINDOW) {
      batch.push(queue.shift());
    }

    const userIds = batch.map(x => x.member.id);
    const displayNames = batch.map(x => x.member.displayName);
    const joinTimestamps = Object.fromEntries(batch.map(x => [x.member.id, x.timestamp]));

    try {
      const allowed = await Promise.all(userIds.map(id => canUserUseTTS(id)));
      if (allowed.includes(false)) {
        console.warn('🚫 משתמשים לא מורשים ל־TTS');
        continue;
      }

      const buffer = batch.length >= GROUP_MIN
        ? await getPodcastAudioEleven(displayNames, userIds, joinTimestamps)
        : await getShortTTSByProfile(batch[0].member);

      const connection = await getOrCreateConnection(channel);
      await playAudio(connection, buffer, displayNames.join(', '));
    } catch (err) {
      console.error('❌ שגיאה בתהליך השמעה:', err.message);
    }

    await wait(TTS_TIMEOUT);
  }

  connectionLocks.delete(key);
}

async function processUserExit(member, channel) {
  try {
    const name = member.displayName;
    const exitLine = `${name} ברח כמו עכבר מהקרב.`;
    const buffer = await getShortTTSByProfile({ ...member, displayName: exitLine });
    const connection = await getOrCreateConnection(channel);
    await playAudio(connection, buffer, name);
  } catch (err) {
    console.error(`🎭 שגיאה בתגובה ליציאה: ${err.message}`);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processUserSmart,
  processUserExit
};

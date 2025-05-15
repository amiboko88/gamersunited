const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { Readable } = require('stream');
const { getUserProfileSSML, synthesizeAzureTTS } = require('../tts/ttsEngine');
const { enqueueTTS, ttsQueue, ttsIsPlaying, setTTSPlaying } = require('../utils/queueManager');
const { updateVoiceActivity } = require('./mvpTracker');
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); // רק אם קיים

const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;
const voiceJoinTimestamps = new Map();
let disconnectTimer = null;

async function handleVoiceStateUpdate(oldState, newState) {
  const user = (newState.member || oldState.member)?.user;
  if (!user || user.bot) return;

  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;
  const userId = user.id;

  // ✅ כניסה לערוץ טסט
  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    voiceJoinTimestamps.set(userId, Date.now());

    const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
    const username = newState.member.displayName;
    enqueueTTS({ channel, username });
    processQueue(channel);
  }

  // ✅ יציאה מהערוץ טסט
  if (leftChannel === TEST_CHANNEL && joinedChannel !== TEST_CHANNEL) {
    const joinedAt = voiceJoinTimestamps.get(userId);
    if (joinedAt) {
      const durationMs = Date.now() - joinedAt;
      const durationMinutes = Math.max(1, Math.floor(durationMs / 1000 / 60)); // לפחות דקה אחת

      try {
        await updateVoiceActivity(userId, durationMinutes, db);
        console.log(`⏱️ ${userId} היה מחובר ${durationMinutes} דקות – נשלח ל־Firestore`);
      } catch (err) {
        console.error(`❌ שגיאה בשמירת זמן קול למשתמש ${userId}:`, err);
      }

      voiceJoinTimestamps.delete(userId);
    }
  }
}

async function processQueue(channel) {
  if (ttsIsPlaying() || ttsQueue.length === 0) return;
  const { username } = ttsQueue.shift();
  setTTSPlaying(true);

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 5000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    const playNext = async () => {
      if (ttsQueue.length === 0) {
        disconnectTimer = setTimeout(() => {
          connection.destroy();
          setTTSPlaying(false);
        }, 10000);
        return;
      }

      const next = ttsQueue.shift();
      const ssml = getUserProfileSSML(next.username);
      const audioBuffer = await synthesizeAzureTTS(ssml);

      if (!audioBuffer || audioBuffer.length < 1000) {
        console.warn(`🔇 קול לא תקין או חסר ל־${next.username}`);
        connection.destroy();
        setTTSPlaying(false);
        return;
      }

      const stream = Readable.from(audioBuffer);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });

      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => {
        clearTimeout(disconnectTimer);
        playNext();
      });
    };

    playNext();
  } catch (err) {
    console.error('❌ שגיאה בתהליך ההשמעה:', err);
    setTTSPlaying(false);
  }
}

module.exports = { handleVoiceStateUpdate };

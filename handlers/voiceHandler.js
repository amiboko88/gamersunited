// 📁 handlers/voiceHandler.js
const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { Readable } = require('stream');
const { getUserProfileSSML, synthesizeAzureTTS } = require('../tts/ttsEngine');
const { enqueueTTS, ttsQueue, ttsIsPlaying, setTTSPlaying } = require('../utils/queueManager');
const { updateVoiceActivity } = require('./mvpTracker');
const db = require('../utils/firebase');

const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;
const voiceJoinTimestamps = new Map();
let disconnectTimer = null;

async function handleVoiceStateUpdate(oldState, newState) {
  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;
  const userId = (newState.member || oldState.member)?.id;

  // משתמש נכנס לערוץ טסט
  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    voiceJoinTimestamps.set(userId, Date.now());

    const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
    const username = newState.member.displayName;
    enqueueTTS({ channel, username });
    processQueue(channel);
  }

  // משתמש עוזב את הערוץ טסט
  if (leftChannel === TEST_CHANNEL && joinedChannel !== TEST_CHANNEL) {
    const joinedAt = voiceJoinTimestamps.get(userId);
    if (joinedAt) {
      const durationMinutes = Math.floor((Date.now() - joinedAt) / 1000 / 60);
      if (durationMinutes > 0) {
        await updateVoiceActivity(userId, durationMinutes, db);
        console.log(`⏱️ ${userId} היה מחובר ${durationMinutes} דקות – נשלח ל־Firestore`);
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
// 📁 handlers/voiceHandler.js – מעודכן ל־Google TTS עם כל הקסמים
const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const { Readable } = require('stream');
const { getUserProfileGoogle, synthesizeGoogleTTS } = require('../tts/ttsEngine');
const { updateVoiceActivity } = require('./mvpTracker');
const db = require('../utils/firebase');
const { log } = require('../utils/logger');

const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;
const voiceJoinTimestamps = new Map();
const ttsQueue = [];
const entryHistory = new Map();
const cooldowns = new Map();

let isPlaying = false;
let connection = null;
let disconnectTimer = null;

// זיהוי משתמש "קרציה"
function isAnnoying(userId) {
  const now = Date.now();
  const history = entryHistory.get(userId) || [];
  const recent = history.filter(ts => now - ts <= 30_000);
  entryHistory.set(userId, [...recent, now]);

  if (recent.length >= 2 && !cooldowns.has(userId)) {
    cooldowns.set(userId, now);
    setTimeout(() => cooldowns.delete(userId), 60_000);
    return true;
  }
  return false;
}

// ניטור כניסות / יציאות
async function handleVoiceStateUpdate(oldState, newState) {
  const user = (newState.member || oldState.member)?.user;
  if (!user || user.bot) return;

  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;
  const userId = user.id;

  // ✅ כניסה לערוץ TTS
  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
    const username = newState.member.displayName;

    if (isAnnoying(userId)) {
      console.log(`🧨 זוהתה קרציה: ${username}`);
      enqueueTTS({ channel, userId: 'ANGRY' });
      return;
    }

    voiceJoinTimestamps.set(userId, Date.now());
    enqueueTTS({ channel, userId });
    processQueue(channel);
  }

  // ✅ יציאה מהערוץ
  if (leftChannel === TEST_CHANNEL && joinedChannel !== TEST_CHANNEL) {
    const joinedAt = voiceJoinTimestamps.get(userId);
    if (joinedAt) {
      const durationMs = Date.now() - joinedAt;
      const durationMinutes = Math.max(1, Math.floor(durationMs / 1000 / 60));
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

// תור TTS
function enqueueTTS(entry) {
  ttsQueue.push(entry);
}

// הפעלת התור
async function processQueue(channel) {
  if (isPlaying || ttsQueue.length === 0) return;
  isPlaying = true;

  try {
    if (!connection || connection.joinConfig.channelId !== channel.id) {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    player.on('error', err => {
      console.error(`🎙️ שגיאה בנגן הקול:`, err);
      isPlaying = false;
      processQueue(channel);
    });

    const playNext = async () => {
      if (ttsQueue.length === 0) {
        disconnectTimer = setTimeout(() => {
          connection.destroy();
          connection = null;
          isPlaying = false;
        }, 5000);
        return;
      }

      const { userId } = ttsQueue.shift();

      // קרציה
      if (userId === 'ANGRY') {
        return playAngryVoice(player, playNext);
      }

      // בונוס אם יש יותר מ־2 בתור
      if (ttsQueue.length >= 2) {
        await playTransitionVoice(player, '📢 עומס בתור, תהיו רגועים!');
      }

      const text = getUserProfileGoogle(userId);
      try {
        const audioBuffer = await synthesizeGoogleTTS(text);
        if (!audioBuffer || audioBuffer.length < 1000) {
          console.warn(`🔇 קול לא תקין ל־${userId}`);
          isPlaying = false;
          return playNext();
        }

        const stream = Readable.from(audioBuffer);
        const resource = createAudioResource(stream, {
          inputType: StreamType.Arbitrary
        });

        player.play(resource);
        player.once(AudioPlayerStatus.Idle, async () => {
          clearTimeout(disconnectTimer);
          if (ttsQueue.length > 0) {
            await playTransitionVoice(player, '⬇️ הבא בתור...');
          }
          isPlaying = false;
          playNext();
        });

        log(`🔈 TTS עבור ${userId}`);
      } catch (err) {
        console.error(`❌ שגיאה בהשמעה עבור ${userId}:`, err);
        isPlaying = false;
        playNext();
      }
    };

    playNext();
  } catch (err) {
    console.error('❌ שגיאה כללית בתור:', err);
    isPlaying = false;
  }
}

// קול מעבר
async function playTransitionVoice(player, text) {
  try {
    const buffer = await synthesizeGoogleTTS(text);
    const stream = Readable.from(buffer);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary
    });
    player.play(resource);
    await new Promise(resolve =>
      player.once(AudioPlayerStatus.Idle, resolve)
    );
  } catch (err) {
    console.warn('⚠️ שגיאה במעבר:', err);
  }
}

// קול כועס לקרציות
async function playAngryVoice(player, onComplete) {
  const angryLine = "די כבר! תבחר – בפנים או בחוץ! הבוט עייף ממך.";
  try {
    const buffer = await synthesizeGoogleTTS(angryLine);
    const stream = Readable.from(buffer);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary
    });
    player.play(resource);
    player.once(AudioPlayerStatus.Idle, () => {
      onComplete();
    });
  } catch (err) {
    console.warn('⚠️ שגיאה ב־ANGRY:', err);
    onComplete();
  }
}

module.exports = { handleVoiceStateUpdate };

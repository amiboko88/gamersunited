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
const recentAnnoyings = new Map();

let isPlaying = false;
let connection = null;
let disconnectTimer = null;

const angryLines = [
  "תפסיק לשגע אותי, יחתיכת בור של חרא.",
  "הופה, עוד קרציה. תעשה טובה, שב בשקט.",
  "אני לא שחקן, אני בוט – אבל אפילו לי נמאס ממך.",
  "שוב אתה? לך לשתות מים ותחשוב על מעשיך.",
  "הצטרפת? יצאת? תחליט כבר יא גוש ביצות!",
  "יא חתיכת נוד מהלך, תן לי לנוח!",
  "הבוט עייף. אתה מעייף. שילוב קטלני.",
  "תקשיב, גם לקפה יש פחות כניסות ויציאות ממך.",
  "השתקה הופעלה. זו לא טעות, זו הצלה.",
  "יאללה, צא ותיכנס – אבל בשקט, חתיכת ג׳וק!"
];

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

async function handleVoiceStateUpdate(oldState, newState) {
  const user = (newState.member || oldState.member)?.user;
  if (!user || user.bot) return;

  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;
  const userId = user.id;
  const displayName = (newState.member || oldState.member)?.displayName || user.username;

  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    const channel = newState.guild.channels.cache.get(TEST_CHANNEL);

    if (isAnnoying(userId)) {
      console.log(`🧨 זוהתה קרציה: ${displayName}`);
      enqueueTTS({ channel, userId: 'ANGRY', displayName });
      recentAnnoyings.set(userId, Date.now());

      const member = newState.member;
      if (member?.voice?.setMute) {
        try {
          await member.voice.setMute(true, 'קרציה detected');
          setTimeout(() => {
            member.voice.setMute(false, 'השתקה הוסרה אוטומטית');
          }, 10_000);
        } catch (err) {
          console.warn(`⚠️ לא ניתן להשתיק את ${displayName}:`, err.message);
        }
      }

      return;
    }

    recentAnnoyings.set(userId, Date.now());
    setTimeout(() => recentAnnoyings.delete(userId), 15_000);

    voiceJoinTimestamps.set(userId, Date.now());
    enqueueTTS({ channel, userId, displayName });
    processQueue(channel);
  }

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

function enqueueTTS(entry) {
  ttsQueue.push(entry);
}

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
        const channelIsEmpty = channel.members.filter(m => !m.user.bot).size === 0;
        const someoneRecentlyAnnoying = [...recentAnnoyings.values()].some(
          ts => Date.now() - ts <= 15_000
        );

        if (channelIsEmpty && !someoneRecentlyAnnoying) {
          console.log('🔌 הערוץ ריק. הבוט מתנתק.');
          connection.destroy();
          connection = null;
          isPlaying = false;
          return;
        }

        disconnectTimer = setTimeout(() => {
          console.log('⏳ הבוט מנותק אוטומטית אחרי השהייה.');
          connection.destroy();
          connection = null;
          isPlaying = false;
        }, 5000);

        return;
      }

      const { userId, displayName } = ttsQueue.shift();

      if (userId === 'ANGRY') {
        return playAngryVoice(player, playNext);
      }

      if (ttsQueue.length >= 2) {
        await playTransitionVoice(player, '📢 עומס בתור, תהיו רגועים!');
      }

      const text = getUserProfileGoogle(userId, displayName);
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

async function playAngryVoice(player, onComplete) {
  const text = angryLines[Math.floor(Math.random() * angryLines.length)];
  try {
    const buffer = await synthesizeGoogleTTS(text);
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

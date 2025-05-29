// 📁 handlers/voiceQueue.js – ניהול חכם של תור TTS, קרציות, פודקאסטים ועוד (FIFO OpenAI + FFmpeg + Prism)

const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  entersState, 
  AudioPlayerStatus, 
  VoiceConnectionStatus,
  StreamType
} = require('@discordjs/voice');

const { 
  getShortTTSByProfile, 
  getPodcastAudioOpenAI,
  canUserUseTTS
} = require('../tts/ttsEngine.openai');

const { shouldUseFallback } = require('../tts/ttsQuotaManager');

const { Readable } = require('stream');
const prism = require('prism-media');

const activeQueue = new Map();
const recentUsers = new Map();
const connectionLocks = new Set();

const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10_000;
const MULTI_JOIN_WINDOW = 6_000;
const BONUS_MIN_COUNT = 3;

// ממיר Buffer ל-Stream (נדרש ל-ffmpeg)
function bufferToStream(buffer) {
  return Readable.from(buffer);
}

// 🏆 פונקציה חכמה – ממירה mp3 ל-PCM (Discord דורש) עם ffmpeg+prism-media
async function playAudio(connection, audioBuffer) {
  // ממיר mp3 מה-TTS ל-PCM RAW
  const prismStream = new prism.FFmpeg({
    args: [
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-f', 'mp3',
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ]
  });

  bufferToStream(audioBuffer).pipe(prismStream);

  const resource = createAudioResource(prismStream, { inputType: StreamType.Raw });
  const player = createAudioPlayer();
  connection.subscribe(player);
  player.play(resource);

  try {
    await entersState(player, AudioPlayerStatus.Idle, 30_000);
  } catch (err) {
    console.error('🛑 השמעה נכשלה:', err);
  }

  player.stop();
  connection.destroy();
}

// זיהוי "קרציות" – משתמשים שמציפים/מציקים
function isUserAnnoying(userId) {
  const now = Date.now();
  const timestamps = recentUsers.get(userId) || [];
  const newTimestamps = [...timestamps.filter(t => now - t < CRITICAL_SPAM_WINDOW), now];
  recentUsers.set(userId, newTimestamps);
  return newTimestamps.length >= 3;
}

/**
 * תור TTS חכם – תומך בהשמעה קבוצתית (פודקאסט) ובודדת, כולל קרציות, בונוסים, Fallback
 * @param {GuildMember} member 
 * @param {VoiceChannel} channel 
 */
async function processUserSmart(member, channel) {
  const userId = member.id;
  const guildId = channel.guild.id;
  const key = `${guildId}-${channel.id}`;

  if (!activeQueue.has(key)) activeQueue.set(key, []);
  const queue = activeQueue.get(key);

  queue.push({ member, timestamp: Date.now() });

  // אם כבר יש השמעה פעילה – נמתין
  if (connectionLocks.has(key)) return;
  connectionLocks.add(key);

  while (queue.length > 0) {
    const { member: nextMember, timestamp } = queue.shift();

    // הגנה – קרציות
    if (isUserAnnoying(nextMember.id)) {
      console.log(`🤬 ${nextMember.displayName} מתנהג כמו קרצייה`);
      continue;
    }

    // בקרת שימוש – quota אישי (אפשר לכבות ע"י הגבלת limit גבוה מאוד)
    if (!(await canUserUseTTS(nextMember.id, 10))) { // ברירת מחדל: 10 השמעות למשתמש ביום
      console.log(`⛔️ ${nextMember.displayName} חרג מהמגבלה היומית האישית`);
      continue;
    }

    // זיהוי התחברות קבוצתית (פודקאסט) – תוך MULTI_JOIN_WINDOW
    const joinedClose = queue.some(item =>
      item.member.id !== nextMember.id &&
      Math.abs(item.timestamp - timestamp) <= MULTI_JOIN_WINDOW
    );

    const usePodcast = joinedClose;
    const useFallback = await shouldUseFallback();
    let audioBuffer;

    try {
      if (usePodcast) {
        // פודקאסט קבוצתי (ריבוי מצטרפים) – קולות FIFO, משפטים מותאמים
        const displayNames = queue.map(item => item.member.displayName);
        const ids = queue.map(item => item.member.id);
        audioBuffer = await getPodcastAudioOpenAI(displayNames, ids);
      } else {
        // TTS אישי – לפי פרופיל המשתמש (כולל Fallback)
        audioBuffer = await getShortTTSByProfile(nextMember, useFallback);
      }
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    // יצירת והפעלת חיבור קולי
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      await playAudio(connection, audioBuffer);
    } catch (err) {
      console.error('🔌 שגיאה בהשמעה:', err);
    }

    await wait(TTS_TIMEOUT);
  }

  connectionLocks.delete(key);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processUserSmart
};

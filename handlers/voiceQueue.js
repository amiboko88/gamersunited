// 📁 handlers/voiceQueue.js – FIFO TTS: תור, קרציות, פודקאסטים, OpenAI, mp3 fallback חכם

const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  entersState, 
  AudioPlayerStatus, 
  VoiceConnectionStatus
} = require('@discordjs/voice');

const { 
  getShortTTSByProfile, 
  getPodcastAudioOpenAI,
  canUserUseTTS
} = require('../tts/ttsEngine.openai');

const { shouldUseFallback } = require('../tts/ttsQuotaManager');

const { Readable } = require('stream');
const fs = require('fs');

const activeQueue = new Map();
const recentUsers = new Map();
const connectionLocks = new Set();

const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10_000;
const MULTI_JOIN_WINDOW = 6_000;
const BONUS_MIN_COUNT = 3;

// ממיר Buffer ל-Stream
function bufferToStream(buffer) {
  return Readable.from(buffer);
}

// 🏆 playAudio – הכי חכם, עובר בין כל שיטה אוטומטית
async function playAudio(connection, audioBuffer) {
  try {
    let success = false;
    let resource, player;
    // 1. ניסיון ראשון: Buffer ישירות
    try {
      resource = createAudioResource(audioBuffer);
      player = createAudioPlayer();
      connection.subscribe(player);
      player.play(resource);
      await entersState(player, AudioPlayerStatus.Idle, 15_000);
      console.log('✅ Buffer נוגן בהצלחה!');
      success = true;
    } catch (err1) {
      console.warn('⚠️ Buffer נכשל, מנסה Path:', err1.message);

      // 2. ניסיון שני: לשמור ל־Path ולהשמיע מהקובץ
      const tmpPath = `/tmp/tts_debug_${Date.now()}.mp3`;
      fs.writeFileSync(tmpPath, audioBuffer);
      try {
        resource = createAudioResource(tmpPath);
        player = createAudioPlayer();
        connection.subscribe(player);
        player.play(resource);
        await entersState(player, AudioPlayerStatus.Idle, 15_000);
        console.log('✅ Path נוגן בהצלחה!');
        success = true;
      } catch (err2) {
        console.warn('⚠️ Path נכשל, מנסה Stream:', err2.message);

        // 3. ניסיון שלישי: stream
        try {
          const stream = bufferToStream(audioBuffer);
          resource = createAudioResource(stream);
          player = createAudioPlayer();
          connection.subscribe(player);
          player.play(resource);
          await entersState(player, AudioPlayerStatus.Idle, 15_000);
          console.log('✅ Stream נוגן בהצלחה!');
          success = true;
        } catch (err3) {
          console.error('❌ כל הניסיונות להשמיע mp3 נכשלו!', err3.message);
        }
      }
    }

    if (!success) {
      // פה אפשר להוסיף Fallback (למשל Google TTS)
      console.warn('🎵 fallback: לא הצלחנו להשמיע קול – אפשר לנסות מנוע אחר');
      // לדוג':
      // const googleBuffer = await googleTTS.synthesizeGoogleTTS(text, speaker);
      // ... ואז תנגן שוב עם אותו תהליך
    }

    if (player) player.stop();
    if (connection) connection.destroy();
  } catch (err) {
    console.error('🛑 השמעה נכשלה – exception:', err.message);
    if (connection) connection.destroy();
  }
}

// זיהוי "קרציות"
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
    if (!(await canUserUseTTS(nextMember.id, 10))) {
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
        const displayNames = queue.map(item => item.member.displayName);
        const ids = queue.map(item => item.member.id);
        audioBuffer = await getPodcastAudioOpenAI(displayNames, ids);
      } else {
        audioBuffer = await getShortTTSByProfile(nextMember, useFallback);
      }
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    // יצירת והפעלת חיבור קולי והשמעה (כולל debug)
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
      });
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

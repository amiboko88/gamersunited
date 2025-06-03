// 📁 handlers/voiceQueue.js – FIFO TTS: תור, פודקאסטים, OpenAI, דיליי חכם, "שמעון חבר", שמירה על חיבור

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
const channelConnections = new Map(); // ⬅️ שמירת חיבור פתוח לפי ערוץ

const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10_000;
const MULTI_JOIN_WINDOW = 6000;
const GROUP_MIN = 3; // מינימום להצגת פודקאסט
const SHIMON_COOLDOWN = 45_000; // שמעון לא מדבר שוב תוך 45 שניות
const CONNECTION_IDLE_TIMEOUT = 60_000; // התנתקות אוטומטית לאחר דקה ללא פעילות

// ממיר Buffer ל-Stream
function bufferToStream(buffer) {
  return Readable.from(buffer);
}

// יצירת וניהול חיבור קולי עם שמירה לערוץ
async function getOrCreateConnection(channel) {
  let record = channelConnections.get(channel.id);
  const now = Date.now();
  if (record && record.connection && record.lastUsed && (now - record.lastUsed < CONNECTION_IDLE_TIMEOUT)) {
    record.lastUsed = now;
    return record.connection;
  }
  // יצירת חיבור חדש
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

// ניתוק אוטומטי מהערוץ אחרי דקה ללא פעילות
setInterval(() => {
  const now = Date.now();
  for (const [channelId, record] of channelConnections) {
    if (now - record.lastUsed > CONNECTION_IDLE_TIMEOUT) {
      try { record.connection.destroy(); } catch (e) {}
      channelConnections.delete(channelId);
    }
  }
}, 20_000);

// ניגון Buffer (mp3) עם ניהול יציב
async function playAudio(connection, audioBuffer) {
  try {
    let success = false;
    let resource, player;
    // ניסיון ראשון: Buffer ישירות
    resource = createAudioResource(audioBuffer);
    player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Idle, 15_000);
    success = true;

    if (player) player.stop();
    // הערה: לא הורסים connection כאן!
  } catch (err) {
    console.error('🛑 השמעה נכשלה – exception:', err.message);
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

// ניהול זמן דיבור אחרון של שמעון
function shouldShimonSpeak(channelId) {
  const lastSpoken = recentUsers.get('shimon-last-spoken-' + channelId) || 0;
  if (Date.now() - lastSpoken < SHIMON_COOLDOWN) return false;
  return true;
}
function markShimonSpoken(channelId) {
  recentUsers.set('shimon-last-spoken-' + channelId, Date.now());
}

/**
 * תור TTS חכם – פודקאסט קבוצתי בכניסות קבוצתיות בלבד, שמירה על חיבור, דילוג על "קרציות", בלי חפירות
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
    const now = Date.now();
    // נסתכל על כל הכניסות האחרונות (window של MULTI_JOIN_WINDOW)
    const batch = [queue.shift()];
    while (queue.length > 0 && (queue[0].timestamp - batch[0].timestamp) <= MULTI_JOIN_WINDOW) {
      batch.push(queue.shift());
    }
    const userIds = batch.map(x => x.member.id);
    const displayNames = batch.map(x => x.member.displayName);

    // הגנה – קרציות
    if (userIds.some(isUserAnnoying)) continue;

    // בקרת שימוש – quota אישי
    for (const user of batch) {
      if (!(await canUserUseTTS(user.member.id, 10))) continue;
    }

    // דיבור קבוצתי – רק אם מספיק אנשים עלו
    const usePodcast = batch.length >= GROUP_MIN;
    // דילוג אם שמעון דיבר לאחרונה
    if (!shouldShimonSpeak(channel.id)) continue;
    let audioBuffer;

    try {
      if (usePodcast) {
        audioBuffer = await getPodcastAudioOpenAI(displayNames, userIds);
      } else {
        // רק משפט קצר לאותו משתמש (לא מדבר פעמיים באותו window)
        audioBuffer = await getShortTTSByProfile(batch[0].member);
      }
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    // הפעלת חיבור קולי והשמעה
    try {
      const connection = await getOrCreateConnection(channel);
      await playAudio(connection, audioBuffer);
      markShimonSpoken(channel.id); // סימון זמן דיבור אחרון
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

// 📁 handlers/voiceQueue.js – FIFO TTS: תור, פודקאסטים, OpenAI, דיליי חכם, הגנה על Buffer, שמירה על חיבור

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');

const {
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  canUserUseTTS
} = require('../tts/ttsEngine.openai');

const { Readable } = require('stream');

const activeQueue = new Map();
const recentUsers = new Map();
const connectionLocks = new Set();
const channelConnections = new Map();

const TTS_TIMEOUT = 5000;
const CRITICAL_SPAM_WINDOW = 10_000;
const MULTI_JOIN_WINDOW = 6000;
const GROUP_MIN = 3;
const SHIMON_COOLDOWN = 45_000;
const CONNECTION_IDLE_TIMEOUT = 60_000;

// יצירת וניהול חיבור קולי עם שמירה לערוץ
async function getOrCreateConnection(channel) {
  let record = channelConnections.get(channel.id);
  const now = Date.now();
  if (record && record.connection && record.lastUsed && (now - record.lastUsed < CONNECTION_IDLE_TIMEOUT)) {
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

// הפעלת Buffer (mp3) עם הגנה קשוחה
async function playAudio(connection, audioBuffer) {
  try {
    if (!Buffer.isBuffer(audioBuffer)) {
      console.error('🛑 השמעה נכשלה – Buffer לא תקין!', typeof audioBuffer, audioBuffer);
      return;
    }
    const { Readable } = require('stream');
    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Idle, 15_000);
    if (player) player.stop();
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

// תור TTS חכם – פודקאסט קבוצתי בכניסות קבוצתיות בלבד, שמירה על חיבור, דילוג על "קרציות", בלי חפירות
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
    let blocked = false;
    for (const user of batch) {
      if (!(await canUserUseTTS(user.member.id, 10))) blocked = true;
    }
    if (blocked) continue;

    // דיבור קבוצתי – רק אם מספיק אנשים עלו
    const usePodcast = batch.length >= GROUP_MIN;
    // דילוג אם שמעון דיבר לאחרונה
    if (!shouldShimonSpeak(channel.id)) continue;
    let audioBuffer;

    try {
      if (usePodcast) {
        audioBuffer = await safeGetPodcastAudioOpenAI(displayNames, userIds);
      } else {
        audioBuffer = await getShortTTSByProfile(batch[0].member);
        if (!Buffer.isBuffer(audioBuffer)) throw new Error('Single TTS audioBuffer אינו Buffer');
      }
    } catch (err) {
      console.error(`TTS error:`, err);
      continue;
    }

    if (!Buffer.isBuffer(audioBuffer)) {
      console.error('🛑 ניסיון השמעה של ערך לא חוקי!', typeof audioBuffer, audioBuffer);
      continue;
    }

    try {
      const connection = await getOrCreateConnection(channel);
      await playAudio(connection, audioBuffer);
      markShimonSpoken(channel.id);
    } catch (err) {
      console.error('🔌 שגיאה בהשמעה:', err);
    }

    await wait(TTS_TIMEOUT);
  }

  connectionLocks.delete(key);
}

// הגנה לפודקאסט: רק Buffer נכנס ל־concat, אם לא – זורקים שגיאה ברורה
async function safeGetPodcastAudioOpenAI(displayNames, userIds) {
  const { getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
  const buffers = [];
  const hasCustom = userIds.length && userIds.some(uid => getScriptByUserId(uid));
  const userScripts = hasCustom
    ? userIds.map(uid => getScriptByUserId(uid))
    : [fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)]];
  const { synthesizeOpenAITTS } = require('../tts/ttsEngine.openai');

  for (const script of userScripts) {
    const { shimon, shirley, punch } = script;
    if (shimon) {
      const buf = await synthesizeOpenAITTS(shimon, 'shimon');
      if (!Buffer.isBuffer(buf)) throw new Error('פודקאסט – shimon לא החזיר Buffer');
      buffers.push(buf);
    }
    if (shirley) {
      const buf = await synthesizeOpenAITTS(shirley, 'shirley');
      if (!Buffer.isBuffer(buf)) throw new Error('פודקאסט – shirley לא החזיר Buffer');
      buffers.push(buf);
    }
    if (punch) {
      const buf = await synthesizeOpenAITTS(punch, Math.random() < 0.5 ? 'shimon' : 'shirley');
      if (!Buffer.isBuffer(buf)) throw new Error('פודקאסט – punch לא החזיר Buffer');
      buffers.push(buf);
    }
  }
  if (!buffers.length) throw new Error('No podcast buffers created!');
  return Buffer.concat(buffers);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processUserSmart
};

// 📁 ttsEngine.openai.js – FIFO OPENAI TTS ENGINE PRO – Buffer בלבד, בלי textPreprocess

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { playerProfiles } = require('../data/profiles');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
// const { shouldUseFallback, registerTTSUsage } = require('./ttsQuotaManager'); // 👈 מושבת זמנית

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const VOICE_MAP = {
  shimon: 'nova',
  shirley: 'shimmer'
};

function getVoiceName(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

// 👇 השבתת Fallback זמנית
async function checkOpenAIQuota(textLength) {
  return true; // מאפשר הכל לבדיקה
}

async function synthesizeOpenAITTS(text, speaker = 'shimon') {
  const allowed = await checkOpenAIQuota(text.length);
  if (!allowed) {
    log(`🛑 שמעון (OpenAI) השתתק – עברנו מגבלה`);
    throw new Error("❌ שמעון עבר מגבלה יומית/חודשית, לא הופק קול!");
  }

  const voice = getVoiceName(speaker);
  const endpoint = "https://api.openai.com/v1/audio/speech";
  log(`🎙️ OpenAI TTS (${voice}) – ${text.length} תווים`);

  const response = await axios.post(
    endpoint,
    {
      model: "tts-1",
      input: text,
      voice,
      response_format: "mp3"
    },
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  if (!response.data || response.data.length < 1200) {
    throw new Error("🔇 OpenAI לא החזיר קול תקין");
  }

  await saveTTSAudit({
    text,
    voice,
    speaker,
    length: text.length,
    timestamp: new Date().toISOString()
  });

  return Buffer.from(response.data);
}

async function saveTTSAudit(data) {
  try {
    const db = admin.firestore();
    await db.collection('openaiTtsAudit').add(data);
  } catch (e) {
    log(`⚠️ לא נשמר ל־Firestore (audit): ${e.message}`);
  }
}

async function getShortTTSByProfile(member) {
  const userId = member.id;
  const displayName = member.displayName;
  let text = getLineForUser(userId, displayName);

  text = cleanTextForTTS(text); // ✅ עיבוד מותאם אישית לקולות nova/shimmer

  const voice = VOICE_MAP.shimon;

  console.log(`🗣️ OpenAI TTS אישי ל־${displayName}: ${text}`);
  const mp3Buffer = await synthesizeOpenAITTS(text, voice);

  console.log(`🎙️ OpenAI TTS (${voice}) – ${text.length} תווים`);
  return mp3Buffer;
}


async function getPodcastAudioOpenAI(displayNames = [], ids = []) {
  const buffers = [];
  const hasCustom = ids.length && ids.some(uid => getScriptByUserId(uid));
  const userScripts = hasCustom
    ? ids.map(uid => getScriptByUserId(uid))
    : [fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)]];

  for (const script of userScripts) {
    const { shimon, shirley, punch } = script;
    if (shimon) buffers.push(await synthesizeOpenAITTS(shimon, 'shimon'));
    if (shirley) buffers.push(await synthesizeOpenAITTS(shirley, 'shirley'));
    if (punch) buffers.push(await synthesizeOpenAITTS(punch, Math.random() < 0.5 ? 'shimon' : 'shirley'));
  }

  return Buffer.concat(buffers);
}

async function canUserUseTTS(userId, limit = 5) {
  return true; // ⛳ ביטול מגבלת שימוש אישי לבדיקה חופשית
}

// 🧠 עיבוד טקסט חכם במיוחד עבור קריינות בעברית לקולות nova (שמעון) ו-shimmer (שירלי)
// מתואם עם fifoLines.js ו-profiles.js למניעת כפל ביטוי או תקיעה בדיבור

function cleanTextForTTS(text) {
  if (!text || typeof text !== 'string') return '';

  const pauseWords = ['יאללה', 'שמע', 'טוב', 'אחי', 'כפרה', 'הלו', 'נו', 'די'];
  const openingWords = ['היי', 'אמאלה', 'פאק', 'בחייאת'];
  const replacements = [
    { pattern: /[!?]{2,}/g, replacement: '!' },
    { pattern: /\s{2,}/g, replacement: ' ' },
    { pattern: /\.{3,}/g, replacement: '...' },
    { pattern: /([א-ת])\1{2,}/g, replacement: '$1' },
    { pattern: /(?:\n|\r|\r\n)/g, replacement: ' ' }
  ];

  let cleaned = text.trim();

  for (const { pattern, replacement } of replacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  for (const word of pauseWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, match =>
      cleaned.includes(`${match}...`) ? match : `${match}...`
    );
  }

  for (const word of openingWords) {
    const regex = new RegExp(`\\b${word}(?![.,…])\\b`, 'gi');
    cleaned = cleaned.replace(regex, `${word},`);
  }

  cleaned = cleaned
    .replace(/\.{4,}/g, '...')
    .replace(/,{2,}/g, ',')
    .replace(/\.\s+\./g, '.')
    .trim();

  return cleaned;
}

module.exports = {
  synthesizeOpenAITTS,
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  getVoiceName,
  canUserUseTTS
};

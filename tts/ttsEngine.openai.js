// 📁 ttsEngine.openai.js – FIFO OPENAI TTS ENGINE PRO – Buffer בלבד, בלי textPreprocess

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { playerProfiles } = require('../data/profiles');
const { getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
// const { shouldUseFallback, registerTTSUsage } = require('./ttsQuotaManager'); // 👈 מושבת זמנית

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const VOICE_MAP = {
  shimon: 'onyx',
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
  const userId = member.user.id;
  const profile = playerProfiles[userId] || playerProfiles['default'];
  const lines = Array.isArray(profile) && profile.length > 0 ? profile : playerProfiles['default'];
  const sentence = lines[Math.floor(Math.random() * lines.length)];
  const speaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
  log(`🗣️ OpenAI TTS אישי ל־${member.displayName}: ${sentence}`);
  return synthesizeOpenAITTS(sentence, speaker);
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

module.exports = {
  synthesizeOpenAITTS,
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  getVoiceName,
  canUserUseTTS
};

// 📁 ttsEngine.elevenlabs.js – מוחלף זמנית ל־OpenAI TTS עם עברית טבעית
const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

const VOICE_MAP = {
  shimon: 'echo', // קול עברי־ניטרלי יותר
  shirley: 'nova'
};

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  const voice = getVoiceId(speaker);
  const cleanText = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '...')
    .replace(/[^\u0590-\u05FF\s\.\,\!\?]/g, '');

  log(`🎙️ OpenAI TTS (${speaker}) – ${cleanText.length} תווים`);

  let response;
  try {
    response = await axios.post(
      OPENAI_TTS_URL,
      {
        model: 'tts-1-hd',
        voice,
        input: cleanText
      },
      {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('🛑 שגיאה בבקשת TTS מ־OpenAI:', err.message);
    throw new Error('שגיאת רשת מול OpenAI');
  }

  if (!response.data || !(response.data instanceof ArrayBuffer) || response.data.byteLength < 1200) {
    throw new Error('🔇 OpenAI החזיר נתון שגוי או קצר מדי');
  }

  const audioBuffer = Buffer.from(response.data);

  await registerTTSUsage(cleanText.length, 1);

  return audioBuffer;
}


async function getShortTTSByProfile(member) {
  const userId = member.id;
  const displayName = member.displayName;
  let text = getLineForUser(userId, displayName);
  return await synthesizeElevenTTS(text, 'shimon');
}

async function getPodcastAudioEleven(displayNames = [], ids = [], joinTimestamps = {}) {
  const buffers = [];
  const participants = ids.map((uid, i) => ({
    id: uid,
    name: displayNames[i] || 'שחקן',
    joinedAt: joinTimestamps[uid] || 0,
    script: getScriptByUserId(uid)
  }));

  participants.sort((a, b) => a.joinedAt - b.joinedAt);

  const hasCustom = participants.some(p => p.script?.shimon || p.script?.shirley);
  const scriptsToUse = hasCustom
    ? participants.map(p => p.script || getRandomFallbackScript())
    : [getRandomFallbackScript()];

  for (const script of scriptsToUse) {
    if (script.shimon?.trim()) {
      try {
        buffers.push(await synthesizeElevenTTS(script.shimon, 'shimon'));
      } catch (err) {
        console.warn('⚠️ כשל בהשמעת שמעון:', err.message);
      }
    }
    if (script.shirley?.trim()) {
      try {
        buffers.push(await synthesizeElevenTTS(script.shirley, 'shirley'));
      } catch (err) {
        console.warn('⚠️ כשל בהשמעת שירלי:', err.message);
      }
    }
  }

  // 🧠 תמיד מוסיפים punch רק אם היה script אישי כלשהו
  if (participants.some(p => p.script)) {
    const punchScript = getRandomFallbackScript().punch;
    if (punchScript?.trim()) {
      try {
        buffers.push(await synthesizeElevenTTS(punchScript, 'shimon'));
      } catch (err) {
        console.warn('⚠️ כשל בהשמעת punch:', err.message);
      }
    }
  }

  if (buffers.length === 0) {
    throw new Error('🔇 אין משפטים קוליים חוקיים להשמעה');
  }

  return Buffer.concat(buffers);
}


function getRandomFallbackScript() {
  return fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)];
}

async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeElevenTTS,
  getShortTTSByProfile,
  getPodcastAudioEleven,
  getVoiceId,
  canUserUseTTS
};

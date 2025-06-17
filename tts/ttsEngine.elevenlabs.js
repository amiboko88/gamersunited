// 📁 ttsEngine.elevenlabs.js – פתרון ביניים לקולות ציבוריים בעברית (ל־Starter)
const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVEN_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// 🟢 קול ציבורי שזמין גם ב־Starter (למשל גבר רגיל)
const VOICE_MAP = {
  shimon: '21m00Tcm4TlvDq8ikWAM', // קול ברירת מחדל ציבורי
  shirley: '21m00Tcm4TlvDq8ikWAM' // אותו קול – אין סגנון נשי אמיתי ב־Starter
};

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  const voiceId = getVoiceId(speaker);
  const cleanText = text.trim().replace(/\s+/g, ' ').replace(/\.{3,}/g, '...');

  log(`🎙️ ElevenLabs TTS (${speaker}) – ${cleanText.length} תווים`);

  const response = await axios.post(
    `${ELEVEN_BASE_URL}/${voiceId}/stream`,
    {
      text: cleanText,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    },
    {
      responseType: 'arraybuffer',
      headers: {
        'xi-api-key': ELEVEN_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.data || response.data.length < 1200) {
    throw new Error('🔇 ElevenLabs לא החזיר קול תקין');
  }

  await registerTTSUsage(cleanText.length, 1);

  return Buffer.from(response.data);
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
    if (script.shimon) buffers.push(await synthesizeElevenTTS(script.shimon, 'shimon'));
    if (script.shirley) buffers.push(await synthesizeElevenTTS(script.shirley, 'shirley'));
  }

  if (participants.some(p => p.script)) {
    const punchScript = getRandomFallbackScript().punch;
    if (punchScript) {
      buffers.push(await synthesizeElevenTTS(punchScript, 'shimon'));
    }
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

// 📁 tts/ttsEngine.elevenlabs.js
const axios = require('axios');
const { log } = require('../utils/logger');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

const ELEVENLABS_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

const VOICE_MAP = {
  // --- הגדרות לצורך הבדיקה ---
  shimon: 'EXAVITQu4vr4xnSDxMaL', // ID של הקול "Rachel"
  shirley: 'EXAVITQu4vr4xnSDxMaL'
};

// נשתמש במודל v2 היציב והרשמי, כי v3 הוא שם שיווקי לממשק כרגע
const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';

function removeNikud(text) {
  return text.replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C7\u05F3\u05F4]/g, '');
}

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API Key is not configured.');
  }

  const voiceId = getVoiceId(speaker);
  const cleanText = removeNikud(text).trim();

  log(`🎙️ ElevenLabs TTS (${speaker}, Voice ID: ${voiceId}, Model: ${DEFAULT_ELEVENLABS_MODEL}) – "${cleanText}"`);

  let response;
  try {
    // חוזרים לבקשה הכי פשוטה ובסיסית כדי למנוע בלבול
    const payload = {
      text: cleanText,
      model_id: DEFAULT_ELEVENLABS_MODEL,
    };

    response = await axios.post(`${ELEVENLABS_TTS_URL}/${voiceId}`, payload, {
      responseType: 'arraybuffer',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'audio/mpeg'
      }
    });
  } catch (err) {
    const errorData = err.response?.data ? new TextDecoder().decode(err.response.data) : err.message;
    console.error('🛑 שגיאה בבקשת TTS מ־ElevenLabs:', errorData);
    throw new Error(`שגיאת API מול ElevenLabs (סטטוס ${err.response?.status || 'N/A'}): ${errorData}`);
  }

  if (!response.data || !Buffer.isBuffer(response.data) || response.data.length < 1024) {
    const errorMsg = `🔇 ElevenLabs החזיר קובץ שמע ריק או פגום (גודל: ${response.data?.length || 0} בתים).`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const audioBuffer = Buffer.from(response.data);
  await registerTTSUsage(cleanText.length, 1);
  return audioBuffer;
}

// שאר הקובץ ללא שינוי
async function getShortTTSByProfile(member) {
  const { getLineForUser } = require('../data/fifoLines');
  const userId = member.id;
  const displayName = member.displayName;
  let text = getLineForUser(userId, displayName);
  return await synthesizeElevenTTS(text, 'shimon');
}

async function canUserUseTTS(userId, limit = 5) { return true; }

module.exports = {
  synthesizeElevenTTS,
  getShortTTSByProfile,
  getVoiceId,
  canUserUseTTS,
};
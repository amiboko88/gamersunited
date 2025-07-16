// 📁 handlers/ttsEngine.elevenlabs.js
const axios = require('axios');
const admin = require('firebase-admin'); 
const { log } = require('../utils/logger');
const { getLineForUser } = require('../data/fifoLines'); 
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

const ELEVENLABS_API_KEY = process.env.ELEVEN_API_KEY; 
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

const VOICE_MAP = {
  shimon: 'TxGEqnHWrfWFTfGW9XjX', // Eli - קול גברי ישראלי - תומך Multi-Lingual
  shirley: 'EXAVITQu4vr4xnSDxMaL' // Rachel - קול נשי - תומך Multi-Lingual
};

const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2'; 

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon']; 
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  if (!ELEVENLABS_API_KEY) {
    console.error('🛑 ELEVENLABS_API_KEY אינו מוגדר. לא ניתן לבצע TTS.');
    throw new Error('ElevenLabs API Key is not configured.');
  }

  const voiceId = getVoiceId(speaker);
  const cleanText = text.trim(); 

  log(`🎙️ ElevenLabs TTS (V3, ${speaker}, Voice ID: ${voiceId}) – ${cleanText.length} תווים`);
  console.log(`[DEBUG TTS] הטקסט הנשלח ל-ElevenLabs: "${cleanText}"`); // ✅ לוג חדש להצגת הטקסט

  let response;
  try {
    response = await axios.post(
      `${ELEVENLABS_TTS_URL}/${voiceId}`,
      {
        text: cleanText,
        model_id: DEFAULT_ELEVENLABS_MODEL, 
        voice_settings: {
          stability: 0.75, 
          similarity_boost: 0.75 
        },
      },
      {
        responseType: 'arraybuffer', 
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg' 
        }
      }
    );
  } catch (err) {
    console.error('🛑 שגיאה בבקשת TTS מ־ElevenLabs:', err.message);
    if (err.response) {
      const errorData = err.response.data ? new TextDecoder().decode(err.response.data) : 'No data';
      console.error('Response data from ElevenLabs:', errorData); 
      console.error('Response status from ElevenLabs:', err.response.status);
      console.error('Response headers from ElevenLabs:', err.response.headers);
      
      throw new Error(`שגיאת API מול ElevenLabs (סטטוס ${err.response.status}): ${errorData}`);
    }
    throw new Error(`שגיאת רשת מול ElevenLabs: ${err.message}`);
  }

  if (!response.data || !(response.data instanceof ArrayBuffer) || response.data.byteLength < 500) {
    throw new Error('🔇 ElevenLabs החזיר Buffer קצר/ריק ללא שגיאת API מפורשת. ייתכן שאין תוכן קולי.');
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

async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeElevenTTS, 
  getShortTTSByProfile, 
  getVoiceId,
  canUserUseTTS,
};
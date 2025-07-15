// 📁 handlers/ttsEngine.elevenlabs.js – מותאם כעת ל־ElevenLabs V3 בלבד
const axios = require('axios');
const admin = require('firebase-admin'); 
const { log } = require('../utils/logger');
// ✅ ייבוא רק את getLineForUser (משמשת ב-getShortTTSByProfile)
const { getLineForUser } = require('../data/fifoLines'); 
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

// 🔑 יש להגדיר את זה כמשתנה סביבה ב-Railway
const ELEVENLABS_API_KEY = process.env.ELEVEN_API_KEY; 
// 🌐 נקודת הקצה של ElevenLabs Text-to-Speech API
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// 🗣️ מיפויי קולות ספציפיים ל-ElevenLabs V3
const VOICE_MAP = {
  shimon: 'TxGEqnHWrfWFTfGW9XjX', // Eli - קול גברי ישראלי - תומך Multi-Lingual
  shirley: 'EXAVITQu4vr4xnSDxMaL' // Rachel - קול נשי - תומך Multi-Lingual
};

// 💡 מודל ברירת מחדל ל-V3
// המודל multi-lingual_v2 מומלץ לעברית ב-V3
const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2'; 

/**
 * מחזיר את ה-Voice ID המתאים לרמקול.
 * @param {string} speaker - שם הדובר ('shimon' או 'shirley').
 * @returns {string} ה-Voice ID המתאים.
 */
function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon']; 
}

/**
 * מבצע סינתזת דיבור באמצעות ElevenLabs V3 API.
 * @param {string} text - הטקסט להמרה לדיבור.
 * @param {string} speaker - הדובר המבוקש ('shimon' או 'shirley').
 * @returns {Promise<Buffer>} Buffer המכיל את נתוני האודיו.
 * @throws {Error} אם מפתח ה-API אינו מוגדר או מתרחשת שגיאת רשת/API.
 */
async function synthesizeElevenTTS(text, speaker = 'shimon') {
  if (!ELEVENLABS_API_KEY) {
    console.error('🛑 ELEVENLABS_API_KEY אינו מוגדר. לא ניתן לבצע TTS.');
    throw new Error('ElevenLabs API Key is not configured.');
  }

  const voiceId = getVoiceId(speaker);
  const cleanText = text.trim(); 

  log(`🎙️ ElevenLabs TTS (V3, ${speaker}, Voice ID: ${voiceId}) – ${cleanText.length} תווים`);

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
      console.error('Response data:', err.response.data ? new TextDecoder().decode(err.response.data) : 'No data');
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
    }
    throw new Error(`שגיאת רשת מול ElevenLabs: ${err.message}`);
  }

  if (!response.data || !(response.data instanceof ArrayBuffer) || response.data.byteLength < 500) {
    throw new Error('🔇 ElevenLabs החזיר נתון שגוי או קצר מדי. ייתכן שאין תוכן קולי.');
  }

  const audioBuffer = Buffer.from(response.data);

  await registerTTSUsage(cleanText.length, 1);

  return audioBuffer;
}

/**
 * משיג קטע TTS קצר עבור פרופיל משתמש.
 * @param {object} member - אובייקט Member של דיסקורד.
 * @returns {Promise<Buffer>} Buffer המכיל את נתוני האודיו.
 */
async function getShortTTSByProfile(member) {
  const userId = member.id;
  const displayName = member.displayName;
  let text = getLineForUser(userId, displayName);
  return await synthesizeElevenTTS(text, 'shimon');
}

// ✅ פונקציה getPodcastAudioEleven הוסרה מכאן - הלוגיקה שלה עברה ל-podcastManager.js
// אם פונקציה זו משמשת במקום אחר, יש להשאיר אותה.

/**
 * בודק אם משתמש מורשה להשתמש ב-TTS.
 * (כרגע תמיד מחזיר true, יש להשלים לוגיקה אם נדרש).
 * @param {string} userId - ה-ID של המשתמש.
 * @param {number} limit - מגבלת שימוש.
 * @returns {Promise<boolean>} האם המשתתף מורשה.
 */
async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeElevenTTS, // נשאר כי משתמשים בו ישירות (ב-podcastManager ובמקומות אחרים)
  getShortTTSByProfile, // נשאר לשימושים אחרים (כמו BirthdayTracker)
  getVoiceId,
  canUserUseTTS,
};
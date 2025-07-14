// 📁 ttsEngine.elevenlabs.js – מותאם כעת ל־ElevenLabs V3 בלבד
const axios = require('axios');
const admin = require('firebase-admin'); 
const { log } = require('../utils/logger');
const { getLineForUser, buildDynamicPodcastScript } = require('../data/fifoLines'); 
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

// 🔑 יש להגדיר את זה כמשתנה סביבה ב-Railway
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY; 
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
  return VOICE_MAP[speaker] || VOICE_MAP['shimon']; // אם הספיקר לא ממופה, נחזיר את קול ברירת המחדל של שמעון
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
  const cleanText = text.trim(); // אין צורך ב-cleanText מורכב כמו ב-OpenAI, ElevenLabs יותר גמיש

  log(`🎙️ ElevenLabs TTS (V3, ${speaker}, Voice ID: ${voiceId}) – ${cleanText.length} תווים`);

  let response;
  try {
    response = await axios.post(
      `${ELEVENLABS_TTS_URL}/${voiceId}`,
      {
        text: cleanText,
        model_id: DEFAULT_ELEVENLABS_MODEL, // שימוש במודל V3 multi-lingual
        voice_settings: {
          stability: 0.75, // מומלץ: לשחק עם הערכים 0-1
          similarity_boost: 0.75 // מומלץ: לשחק עם הערכים 0-1
        },
        // פרמטר language_id: 'he' אינו נתמך ישירות ב-V1 Text-to-Speech API Path
        // המודל ה-multilingual אמור לזהות אוטומטית.
      },
      {
        responseType: 'arraybuffer', // לקבל את התגובה כ-Buffer
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg' // ניתן לשנות ל-audio/wav או פורמטים אחרים
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

  // בדיקת תגובה תקינה
  if (!response.data || !(response.data instanceof ArrayBuffer) || response.data.byteLength < 500) {
    throw new Error('🔇 ElevenLabs החזיר נתון שגוי או קצר מדי. ייתכן שאין תוכן קולי.');
  }

  const audioBuffer = Buffer.from(response.data);

  // רישום שימוש במכסה
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

/**
 * מרכיב אודיו עבור פודקאסט מרובה דוברים באמצעות ElevenLabs.
 * @param {string[]} displayNames - שמות תצוגה של המשתתפים.
 * @param {string[]} ids - ID-ים של המשתתפים.
 * @param {object} joinTimestamps - מפתחות זמן הצטרפות של המשתתפים.
 * @returns {Promise<Buffer>} Buffer מאוחד של כל קטעי האודיו.
 * @throws {Error} אם אין משפטים קוליים חוקיים להשמעה.
 */
async function getPodcastAudioEleven(displayNames = [], ids = [], joinTimestamps = {}) {
  const buffers = [];
  const participants = ids.map((uid, i) => ({
    id: uid,
    name: displayNames[i] || 'שחקן',
    joinedAt: joinTimestamps[uid] || 0
  }));

  // 🆕 קריאה לפונקציה החדשה לבניית הסקריפט הדינמי מ-fifoLines.js
  const podcastScriptLines = buildDynamicPodcastScript(participants);

  for (const line of podcastScriptLines) {
    if (line.text?.trim()) {
      try {
        buffers.push(await synthesizeElevenTTS(line.text, line.speaker));
      } catch (err) {
        console.warn(`⚠️ כשל בהשמעת ${line.speaker} (ElevenLabs):`, err.message);
      }
    }
  }

  if (buffers.length === 0) {
    throw new Error('🔇 אין משפטים קוליים חוקיים להשמעה בפודקאסט');
  }

  return Buffer.concat(buffers);
}

/**
 * בודק אם משתמש מורשה להשתמש ב-TTS.
 * (כרגע תמיד מחזיר true, יש להשלים לוגיקה אם נדרש).
 * @param {string} userId - ה-ID של המשתמש.
 * @param {number} limit - מגבלת שימוש.
 * @returns {Promise<boolean>} האם המשתמש מורשה.
 */
async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeElevenTTS,
  getShortTTSByProfile,
  getPodcastAudioEleven,
  getVoiceId,
  canUserUseTTS,
};
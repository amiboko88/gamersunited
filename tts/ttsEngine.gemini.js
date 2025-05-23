// 📁 tts/ttsEngine.gemini.js – FIFO PODCAST ENGINE עם Gemini TTS

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_CHAR_LIMIT = 10_000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300_000;

function getDateKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function checkGeminiQuota(textLength) {
  const db = admin.firestore();
  const dateKey = getDateKey();
  const monthKey = getMonthKey();

  const dailyRef = db.doc(`geminiTtsUsage/daily/${dateKey}`);
  const monthlyRef = db.doc(`geminiTtsUsage/monthly/${monthKey}`);

  const [dailySnap, monthlySnap] = await Promise.all([
    dailyRef.get(),
    monthlyRef.get()
  ]);

  const dailyData = dailySnap.exists ? dailySnap.data() : { totalCharacters: 0, totalCalls: 0 };
  const monthlyData = monthlySnap.exists ? monthlySnap.data() : { totalCharacters: 0 };

  if (dailyData.totalCharacters + textLength > DAILY_CHAR_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת התווים היומית`);
    return false;
  }

  if (dailyData.totalCalls + 1 > DAILY_CALL_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת הקריאות היומית`);
    return false;
  }

  if (monthlyData.totalCharacters + textLength > MONTHLY_CHAR_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת התווים החודשית`);
    return false;
  }

  if ((monthlyData.totalCharacters + textLength) > MONTHLY_CHAR_LIMIT * 0.8) {
    log(`⚠️ קרוב למגבלה החודשית (${((monthlyData.totalCharacters + textLength) / MONTHLY_CHAR_LIMIT * 100).toFixed(1)}%)`);
  }

  await Promise.all([
    dailyRef.set({
      totalCharacters: dailyData.totalCharacters + textLength,
      totalCalls: dailyData.totalCalls + 1,
      lastUpdated: new Date().toISOString()
    }),
    monthlyRef.set({
      totalCharacters: monthlyData.totalCharacters + textLength,
      lastUpdated: new Date().toISOString()
    })
  ]);

  return true;
}

function getVoiceParams(speaker = 'shimon') {
  const voices = {
    shimon: 'puck',
    shirley: 'zephyr'
  };
  return voices[speaker] || voices.shimon;
}

async function synthesizeGeminiTTS(text, speaker = 'shimon') {
  const allowed = await checkGeminiQuota(text.length);
  if (!allowed) throw new Error("❌ חרגנו מהמגבלות של Gemini TTS");

  const voice = getVoiceParams(speaker);
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-tts:generateSpeech?key=' + GEMINI_API_KEY;

  log(`🎙️ Gemini TTS (${voice}) – ${text.length} תווים`);

  try {
    const response = await axios.post(endpoint, {
      input: {
        text: text
      },
      voice: {
        name: voice
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    }, {
      responseType: 'arraybuffer'
    });

    if (!response.data || response.data.length < 1000) {
      throw new Error('🔇 Gemini לא החזיר קול תקין');
    }

    return Buffer.from(response.data);
  } catch (err) {
    console.error('❌ שגיאה ב־Gemini TTS:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = {
  synthesizeGeminiTTS
};

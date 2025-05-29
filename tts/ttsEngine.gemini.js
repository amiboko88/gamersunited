// 📁 tts/ttsEngine.gemini.js – FIFO PODCAST ENGINE עם Gemini TTS

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getScriptByUserId } = require('../data/fifoLines');
const { getProfileByUserId } = require('../data/profiles');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

function getDateKey() {
  return new Date().toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getVoiceName(speaker = 'shimon') {
  const voices = {
    shimon: 'puck',
    shirley: 'zephyr'
  };
  return voices[speaker] || voices.shimon;
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

  const daily = dailySnap.exists ? dailySnap.data() : { totalCharacters: 0, totalCalls: 0 };
  const monthly = monthlySnap.exists ? monthlySnap.data() : { totalCharacters: 0 };

  if (daily.totalCharacters + textLength > DAILY_CHAR_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת התווים היומית`);
    return false;
  }

  if (daily.totalCalls + 1 > DAILY_CALL_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת הקריאות היומית`);
    return false;
  }

  if (monthly.totalCharacters + textLength > MONTHLY_CHAR_LIMIT) {
    log(`🛑 שמעון השתתק – עברנו את מגבלת התווים החודשית`);
    return false;
  }

  await Promise.all([
    dailyRef.set({
      totalCharacters: daily.totalCharacters + textLength,
      totalCalls: daily.totalCalls + 1,
      lastUpdated: new Date().toISOString()
    }, { merge: true }),
    monthlyRef.set({
      totalCharacters: monthly.totalCharacters + textLength,
      lastUpdated: new Date().toISOString()
    }, { merge: true })
  ]);

  return true;
}

async function synthesizeGeminiTTS(text, speaker = 'shimon') {
  const allowed = await checkGeminiQuota(text.length);
  if (!allowed) throw new Error("❌ חרגנו מהמגבלות של Gemini TTS");

  const voice = getVoiceName(speaker);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-tts:generateSpeech?key=${GEMINI_API_KEY}`;

  log(`🎙️ Gemini TTS (${voice}) – ${text.length} תווים`);

  try {
    const response = await axios.post(endpoint, {
      input: { text },
      voice: { name: voice },
      audioConfig: { audioEncoding: 'MP3' }
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

async function getPodcastAudioGemini(userId) {
  const script = getScriptByUserId(userId);
  const segments = [
    { speaker: 'shimon', text: script.shimon },
    { speaker: 'shirley', text: script.shirley },
    { speaker: 'shimon', text: script.punch }
  ];

  const buffers = [];
  for (const seg of segments) {
    const buffer = await synthesizeGeminiTTS(seg.text, seg.speaker);
    buffers.push(buffer);
  }

  return buffers;
}

async function getShortTTSByProfile(userId) {
  const profile = getProfileByUserId(userId);
  const text = Array.isArray(profile?.lines)
    ? profile.lines[Math.floor(Math.random() * profile.lines.length)]
    : 'ברוך הבא לחדר, גבר.';
  const speaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
  return await synthesizeGeminiTTS(text, speaker);
}

module.exports = {
  synthesizeGeminiTTS,
  getPodcastAudioGemini,
  getShortTTSByProfile
};

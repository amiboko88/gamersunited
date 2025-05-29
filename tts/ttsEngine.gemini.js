// 📁 ttsEngine.gemini.js – FIFO TTS ENGINE עם Gemini 2.5 Pro

const axios = require('axios');
const admin = require('firebase-admin');
const { getScriptByUserId } = require('../data/fifoLines');
const { getProfileByUserId } = require('../data/profiles');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-tts:generateSpeech';

// 🗓️ יצירת מפתחות תאריך
function getDateKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 🧠 בדיקת מגבלות תווים / קריאות
async function checkGeminiQuota(textLength) {
  const db = admin.firestore();
  const dateKey = getDateKey();
  const monthKey = getMonthKey();
  const dailyRef = db.doc(`geminiTtsUsage/daily/${dateKey}`);
  const monthlyRef = db.doc(`geminiTtsUsage/monthly/${monthKey}`);

  const [dailySnap, monthlySnap] = await Promise.all([dailyRef.get(), monthlyRef.get()]);
  const dailyData = dailySnap.exists ? dailySnap.data() : { totalCharacters: 0, totalCalls: 0 };
  const monthlyData = monthlySnap.exists ? monthlySnap.data() : { totalCharacters: 0 };

  if (
    dailyData.totalCharacters + textLength > DAILY_CHAR_LIMIT ||
    dailyData.totalCalls + 1 > DAILY_CALL_LIMIT ||
    monthlyData.totalCharacters + textLength > MONTHLY_CHAR_LIMIT
  ) {
    return false;
  }

  await Promise.all([
    dailyRef.set({
      totalCharacters: dailyData.totalCharacters + textLength,
      totalCalls: dailyData.totalCalls + 1,
      lastUpdated: new Date().toISOString()
    }, { merge: true }),
    monthlyRef.set({
      totalCharacters: monthlyData.totalCharacters + textLength,
      lastUpdated: new Date().toISOString()
    }, { merge: true })
  ]);

  return true;
}

// 🎙️ מיפוי קולות
function getVoiceName(speaker) {
  return speaker === 'shirley' ? 'zephyr' : 'puck';
}

// 🎤 הפקת אודיו מ-Gemini לפי טקסט ודמות
async function synthesizeGeminiTTS(text, speaker = 'shimon') {
  const allowed = await checkGeminiQuota(text.length);
  if (!allowed) throw new Error("🚫 Gemini TTS limit reached");

  const voice = getVoiceName(speaker);
  const url = `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`;

  const response = await axios.post(url, {
    input: { text },
    voice: { name: voice },
    audioConfig: { audioEncoding: 'MP3' }
  }, { responseType: 'arraybuffer' });

  if (!response.data || response.data.length < 1000) {
    throw new Error("🔇 Gemini TTS did not return valid audio");
  }

  return Buffer.from(response.data);
}

// 🎧 פודקאסט מלא לפי תסריט fifoLines
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

// 🗯️ משפט קצר לפי פרופיל אישי
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

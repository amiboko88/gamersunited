const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { FIFO_LINES } = require('../data/fifoLines');
const { playerProfiles } = require('../data/profiles');

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

function getProfileByUserId(userId) {
  return {
    lines: playerProfiles[userId] || playerProfiles['default']
  };
}

async function checkGeminiQuota(textLength) {
  const db = admin.firestore();
  const dateKey = getDateKey();
  const monthKey = getMonthKey();

  const dailyRef = db.collection('geminiTtsUsage').doc(`daily-${dateKey}`);
  const monthlyRef = db.collection('geminiTtsUsage').doc(`monthly-${monthKey}`);

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

async function getShortTTSByProfile(member) {
  const userId = member.user.id;
  const profile = getProfileByUserId(userId);

  const lines = Array.isArray(profile?.lines) && profile.lines.length > 0
    ? profile.lines
    : playerProfiles['default'];

  const sentence = lines[Math.floor(Math.random() * lines.length)];
  const speaker = Math.random() < 0.5 ? 'shimon' : 'shirley';

  log(`🗣️ TTS אישי ל־${member.displayName}: ${sentence}`);
  return synthesizeGeminiTTS(sentence, speaker);
}

async function getPodcastAudioGemini(displayNames = []) {
  const buffers = [];

  for (const [speaker, line] of FIFO_LINES) {
    const fullLine = line.replace('{players}', displayNames.join(', '));
    const audioBuffer = await synthesizeGeminiTTS(fullLine, speaker);
    buffers.push(audioBuffer);
  }

  return Buffer.concat(buffers);
}

module.exports = {
  synthesizeGeminiTTS,
  getShortTTSByProfile,
  getPodcastAudioGemini,
  getProfileByUserId,
  getVoiceName
};

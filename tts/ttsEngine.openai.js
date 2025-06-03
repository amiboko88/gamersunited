// 📁 ttsEngine.openai.js – FIFO OPENAI TTS ENGINE PRO – הגנה מלאה על Buffer

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { playerProfiles } = require('../data/profiles');
const { getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { shouldUseFallback, registerTTSUsage } = require('./ttsQuotaManager');

// ⬅️ מנגנון ניקוד ופיסוק
const { preprocessTTS } = require('./textPreprocess');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

const VOICE_MAP = {
  shimon: 'onyx',
  shirley: 'shimmer'
};

function getVoiceName(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

// בדיקת מגבלה ועדכון usage
async function checkOpenAIQuota(textLength) {
  const overQuota = await shouldUseFallback();
  if (overQuota) return false;
  await registerTTSUsage(textLength);
  return true;
}

// הפקת TTS אמיתי (OpenAI בלבד, הגנה מלאה על Buffer)
async function synthesizeOpenAITTS(text, speaker = 'shimon') {
  // ניקוד/פיסוק
  const upgradedText = preprocessTTS(text);

  const allowed = await checkOpenAIQuota(upgradedText.length);
  if (!allowed) {
    log(`🛑 שמעון (OpenAI) השתתק – עברנו מגבלה`);
    throw new Error("❌ שמעון עבר מגבלה יומית/חודשית, לא הופק קול!");
  }

  const voice = getVoiceName(speaker);
  const endpoint = "https://api.openai.com/v1/audio/speech";
  log(`🎙️ OpenAI TTS (${voice}) – ${upgradedText.length} תווים`);

  const response = await axios.post(
    endpoint,
    {
      model: "tts-1",
      input: upgradedText,
      voice,
      response_format: "mp3"
    },
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  // הגנה מלאה: כל מצב הופך ל-Buffer תקין
  let bufferData;
  if (Buffer.isBuffer(response.data)) {
    bufferData = response.data;
  } else if (response.data instanceof ArrayBuffer) {
    bufferData = Buffer.from(new Uint8Array(response.data));
  } else if (Array.isArray(response.data)) {
    bufferData = Buffer.from(response.data);
  } else {
    console.error('❌ סוג לא מזוהה ל-response.data:', typeof response.data, response.data);
    throw new Error('❌ OpenAI response.data לא חוקי: ' + typeof response.data);
  }

  // DEBUG: מחיקת הדפסה אחרי בדיקה!
  // console.log('>>> bufferData', bufferData, Buffer.isBuffer(bufferData), bufferData.length);

  if (!Buffer.isBuffer(bufferData) || bufferData.length < 1200) {
    throw new Error("🔇 OpenAI לא החזיר קול תקין");
  }

  await saveTTSAudit({
    text: upgradedText,
    voice,
    speaker,
    length: upgradedText.length,
    timestamp: new Date().toISOString()
  });

  return bufferData;
}

// שמירה ללוג audit ב-Firestore
async function saveTTSAudit(data) {
  try {
    const db = admin.firestore();
    await db.collection('openaiTtsAudit').add(data);
  } catch (e) {
    log(`⚠️ לא נשמר ל־Firestore (audit): ${e.message}`);
  }
}

// TTS אישי – תמיד OpenAI
async function getShortTTSByProfile(member) {
  const userId = member.user.id;
  const profile = playerProfiles[userId] || playerProfiles['default'];
  const lines = Array.isArray(profile) && profile.length > 0 ? profile : playerProfiles['default'];
  const sentence = lines[Math.floor(Math.random() * lines.length)];
  const speaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
  log(`🗣️ OpenAI TTS אישי ל־${member.displayName}: ${sentence}`);
  return synthesizeOpenAITTS(sentence, speaker);
}

// פודקאסט קבוצתי – OpenAI בלבד עם הגנה על Buffer
async function getPodcastAudioOpenAI(displayNames = [], ids = []) {
  const buffers = [];
  const hasCustom = ids.length && ids.some(uid => getScriptByUserId(uid));
  const userScripts = hasCustom
    ? ids.map(uid => getScriptByUserId(uid))
    : [fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)]];

  for (const script of userScripts) {
    const { shimon, shirley, punch } = script;
    if (shimon) {
      const buf = await synthesizeOpenAITTS(shimon, 'shimon');
      if (!Buffer.isBuffer(buf)) throw new Error('getPodcastAudioOpenAI: shimon לא החזיר Buffer');
      buffers.push(buf);
    }
    if (shirley) {
      const buf = await synthesizeOpenAITTS(shirley, 'shirley');
      if (!Buffer.isBuffer(buf)) throw new Error('getPodcastAudioOpenAI: shirley לא החזיר Buffer');
      buffers.push(buf);
    }
    if (punch) {
      const buf = await synthesizeOpenAITTS(punch, Math.random() < 0.5 ? 'shimon' : 'shirley');
      if (!Buffer.isBuffer(buf)) throw new Error('getPodcastAudioOpenAI: punch לא החזיר Buffer');
      buffers.push(buf);
    }
  }
  if (!buffers.length) throw new Error('getPodcastAudioOpenAI: No podcast buffers created!');
  return Buffer.concat(buffers);
}

// בדיקת מגבלה למשתמש בודד
async function canUserUseTTS(userId, limit = 5) {
  const db = admin.firestore();
  const key = `${userId}_${new Date().toISOString().split('T')[0]}`;
  const ref = db.collection('ttsUserQuota').doc(key);
  const snap = await ref.get();
  const { used = 0 } = snap.exists ? snap.data() : {};
  if (used >= limit) return false;
  await ref.set({ used: used + 1, last: new Date().toISOString() }, { merge: true });
  return true;
}

module.exports = {
  synthesizeOpenAITTS,
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  getVoiceName,
  canUserUseTTS
};

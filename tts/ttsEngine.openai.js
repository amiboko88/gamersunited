// 📁 ttsEngine.openai.js – FIFO OPENAI TTS ENGINE PRO

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { playerProfiles } = require('../data/profiles');
const { getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { shouldUseFallback, registerTTSUsage } = require('./ttsQuotaManager');
const googleTTS = require('./ttsEngine'); // fallback רגיל

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DAILY_CHAR_LIMIT = 10000; // אפשרי להרחיב
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

// 🗣️ קונפיג שמות קולות (גברי/נשי)
const VOICE_MAP = {
  shimon: 'onyx',
  shirley: 'shimmer'
};

function getVoiceName(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

// 🔎 בדיקת quota – מבוסס ttsQuotaManager
async function checkOpenAIQuota(textLength) {
  const overQuota = await shouldUseFallback(); // אם קרוב למגבלה – fallback
  if (overQuota) return false;
  // נרשום שימוש בתווים/קריאות
  await registerTTSUsage(textLength);
  return true;
}

// 🏆 לוגיקה עיקרית – קריאה ל־OpenAI TTS
async function synthesizeOpenAITTS(text, speaker = 'shimon') {
  // בדיקת מגבלות
  const allowed = await checkOpenAIQuota(text.length);
  if (!allowed) {
    log(`🛑 שמעון (OpenAI) השתתק – עברנו מגבלה`);
    // fallback ל־Google TTS (אם אפשר)
    try {
      return await googleTTS.synthesizeGoogleTTS(text, speaker);
    } catch (e) {
      throw new Error("❌ לא הצלחנו להשמיע קול – גם fallback נכשל");
    }
  }

  const voice = getVoiceName(speaker);
  const endpoint = "https://api.openai.com/v1/audio/speech";
  log(`🎙️ OpenAI TTS (${voice}) – ${text.length} תווים`);

  try {
    const response = await axios.post(
      endpoint,
      {
        model: "tts-1",
        input: text,
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

    // בדיקת אורך/איכות קול
    if (!response.data || response.data.length < 1200) {
      throw new Error("🔇 OpenAI לא החזיר קול תקין");
    }

    // שמירה ל־Firestore – audit
    await saveTTSAudit({
      text,
      voice,
      speaker,
      length: text.length,
      timestamp: new Date().toISOString()
    });

    return Buffer.from(response.data);
  } catch (err) {
    log(`❌ שגיאה ב־OpenAI TTS: ${err.response?.data?.error?.message || err.message}`);
    // fallback ל־Google TTS (אפשר לשנות לשקט/הודעה)
    try {
      return await googleTTS.synthesizeGoogleTTS(text, speaker);
    } catch (e) {
      throw new Error("❌ גם Fallback Google TTS נכשל – בדוק API KEY");
    }
  }
}

// 📝 שמירת audit לכל השמעה
async function saveTTSAudit(data) {
  try {
    const db = admin.firestore();
    await db.collection('openaiTtsAudit').add(data);
  } catch (e) {
    log(`⚠️ לא נשמר ל־Firestore (audit): ${e.message}`);
  }
}

// 🧑‍💻 TTS אישי ע"פ פרופיל משתמש (userId)
async function getShortTTSByProfile(member) {
  const userId = member.user.id;
  const profile = playerProfiles[userId] || playerProfiles['default'];
  const lines = Array.isArray(profile) && profile.length > 0 ? profile : playerProfiles['default'];
  const sentence = lines[Math.floor(Math.random() * lines.length)];
  const speaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
  log(`🗣️ OpenAI TTS אישי ל־${member.displayName}: ${sentence}`);
  return synthesizeOpenAITTS(sentence, speaker);
}

// 🎧 פודקאסט FIFO – לפי שמות, תסריט, fallback אם אין אישי
async function getPodcastAudioOpenAI(displayNames = [], ids = []) {
  const buffers = [];
  // אם אין ייחודי – ניקח fallback כללי (הומוריסטי)
  const hasCustom = ids.length && ids.some(uid => getScriptByUserId(uid));
  const userScripts = hasCustom
    ? ids.map(uid => getScriptByUserId(uid))
    : [fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)]];

  // להריץ כל שורה של פודקאסט
  for (const script of userScripts) {
    const { shimon, shirley, punch } = script;
    if (shimon) buffers.push(await synthesizeOpenAITTS(shimon, 'shimon'));
    if (shirley) buffers.push(await synthesizeOpenAITTS(shirley, 'shirley'));
    if (punch) buffers.push(await synthesizeOpenAITTS(punch, Math.random() < 0.5 ? 'shimon' : 'shirley'));
  }
  return Buffer.concat(buffers);
}

// ⏳ פונקציה חדשה: TTS חכם – מאפשר quota פר משתמש (אופציונלי)
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

// ◀️ יצוא
module.exports = {
  synthesizeOpenAITTS,
  getShortTTSByProfile,
  getPodcastAudioOpenAI,
  getVoiceName,
  canUserUseTTS
};

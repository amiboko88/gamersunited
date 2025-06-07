// 📁 ttsEngine.elevenlabs.js – FIFO TTS via ElevenLabs – גרסה מלאה כולל ניהול מגבלות

const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven'); // ✅ ניהול מגבלות

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVEN_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

const VOICE_MAP = {
  shimon: 'pNInz6obpgDQGcFmaJgB',   // שמעון – קול גברי חזק
  shirley: 'EXAVITQu4vr4xnSDxMaL'   // שירלי – קול נשי גונח
};

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

function injectStyleTags(text, speaker) {
  if (!text || typeof text !== 'string') return text;

  const lowered = text.toLowerCase();

  const isInsult = /תמות|פתטי|זבל|הפסד|תירוץ|קרציה|עוף|נשמה/.test(text);
  const isSexy = /אוי|יאו+|נמסתי|חם לי|בוא|תירה בי|נמס|רועד/.test(text);
  const isSarcastic = /ברוך הבא|מדהים|כל הכבוד|כפרה|בטח|נו באמת/.test(text);
  const isShout = /[!]{1,}/.test(text);
  const isPunch = text.length < 20;

  if (speaker === 'shimon') {
    let tag = '[angry]';
    if (isInsult) tag = '[shouting][angry][laughs]';
    else if (isShout) tag = '[shouting][angry]';
    else if (isSarcastic) tag = '[sarcastic][laughs]';
    else if (isPunch) tag = '[silly][laughs]';
    return `${tag} ${text} [laughs]`;
  }

  if (speaker === 'shirley') {
    let tag = '[soft]';
    if (isSexy) tag = '[moaning][excited]';
    else if (isSarcastic) tag = '[giggles][flirty]';
    else if (isPunch) tag = '[teasing][giggles]';
    return `${tag} ${text} [laughs]`;
  }

  return text;
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  const voiceId = getVoiceId(speaker);
  const styledText = injectStyleTags(text, speaker);

  log(`🎙️ ElevenLabs TTS (${speaker}) – ${styledText.length} תווים`);

  const response = await axios.post(
    `${ELEVEN_BASE_URL}/${voiceId}/stream`,
    {
      text: styledText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.65
      }
    },
    {
      responseType: 'arraybuffer',
      headers: {
        'xi-api-key': ELEVEN_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.data || response.data.length < 1200) {
    throw new Error("🔇 ElevenLabs לא החזיר קול תקין");
  }

  await registerTTSUsage(styledText.length, 1); // ✅ נרשם שימוש

  await saveTTSAudit({
    text: styledText,
    speaker,
    voiceId,
    length: styledText.length,
    timestamp: new Date().toISOString()
  });

  return Buffer.from(response.data);
}

async function saveTTSAudit(data) {
  try {
    const db = admin.firestore();
    await db.collection('elevenTtsAudit').add(data);
  } catch (e) {
    log(`⚠️ לא נשמר ל־Firestore (audit): ${e.message}`);
  }
}

async function getShortTTSByProfile(member) {
  const userId = member.id;
  const displayName = member.displayName;
  let text = getLineForUser(userId, displayName);
  text = cleanTextForTTS(text);
  const mp3Buffer = await synthesizeElevenTTS(text, 'shimon');
  return mp3Buffer;
}

async function getPodcastAudioEleven(displayNames = [], ids = [], joinTimestamps = {}) {
  const buffers = [];
  const participants = ids.map((uid, i) => ({
    id: uid,
    name: displayNames[i] || 'שחקן',
    joinedAt: joinTimestamps[uid] || 0,
    script: getScriptByUserId(uid)
  }));

  participants.sort((a, b) => a.joinedAt - b.joinedAt);

  const hasCustom = participants.some(p => p.script?.shimon || p.script?.shirley);
  const scriptsToUse = hasCustom
    ? participants.map(p => p.script || getRandomFallbackScript())
    : [getRandomFallbackScript()];

  for (const script of scriptsToUse) {
    if (script.shimon) buffers.push(await synthesizeElevenTTS(cleanTextForTTS(script.shimon), 'shimon'));
    if (script.shirley) buffers.push(await synthesizeElevenTTS(cleanTextForTTS(script.shirley), 'shirley'));
  }

  if (participants.some(p => p.script)) {
    const punchScript = getRandomFallbackScript().punch;
    if (punchScript) {
      const randomSpeaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
      buffers.push(await synthesizeElevenTTS(cleanTextForTTS(punchScript), randomSpeaker));
    }
  }

  return Buffer.concat(buffers);
}

function getRandomFallbackScript() {
  return fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)];
}

function cleanTextForTTS(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ').replace(/\.{3,}/g, '...');
}

async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeElevenTTS,
  getShortTTSByProfile,
  getPodcastAudioEleven,
  getVoiceId,
  canUserUseTTS
};

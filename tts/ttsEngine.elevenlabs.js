const axios = require('axios');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven');

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVEN_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

const VOICE_MAP = {
  shimon: '876MHA6EtWKaHTEGzjy5',   // קול עברי גברי
  shirley: 'tnSpp4vdxKPjI9w0GnoV'   // קול עברי נשי
};

function getVoiceId(speaker = 'shimon') {
  return VOICE_MAP[speaker] || VOICE_MAP['shimon'];
}

function getV3Tags(text, speaker) {
  if (!text || typeof text !== 'string') return text;
  const lowered = text.toLowerCase();

  const isInsult = /תמות|פתטי|זבל|הפסד|קרציה|עוף/.test(text);
  const isSexy = /אוי|יאו+|נמסתי|חם לי|בוא|תירה בי/.test(text);
  const isSarcastic = /ברוך הבא|מדהים|כל הכבוד|כפרה/.test(text);
  const isShout = /!{1,}/.test(text);
  const isShort = text.length < 20;

  if (speaker === 'shimon') {
    if (isInsult) return `<shouting><angry>${text}</angry></shouting>`;
    if (isShout) return `<shouting>${text}</shouting>`;
    if (isSarcastic) return `<sarcastic>${text}</sarcastic>`;
    if (isShort) return `<excited>${text}</excited>`;
    return `<neutral>${text}</neutral>`;
  }

  if (speaker === 'shirley') {
    if (isSexy) return `<excited>${text}</excited>`;
    if (isSarcastic) return `<sarcastic>${text}</sarcastic>`;
    if (isShort) return `<emotional>${text}</emotional>`;
    return `<soft>${text}</soft>`;
  }

  return text;
}

async function synthesizeElevenTTS(text, speaker = 'shimon') {
  const voiceId = getVoiceId(speaker);
  const styledText = getV3Tags(cleanTextForTTS(text), speaker);

  log(`🎙️ ElevenLabs V3 TTS (${speaker}) – ${styledText.length} תווים`);

  const response = await axios.post(
    `${ELEVEN_BASE_URL}/${voiceId}/stream`,
    {
      text: styledText,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75
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

  await registerTTSUsage(styledText.length, 1);

  await saveTTSAudit({
    text: styledText,
    speaker,
    voiceId,
    model: 'eleven_v3',
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
    if (script.shimon) buffers.push(await synthesizeElevenTTS(script.shimon, 'shimon'));
    if (script.shirley) buffers.push(await synthesizeElevenTTS(script.shirley, 'shirley'));
  }

  if (participants.some(p => p.script)) {
    const punchScript = getRandomFallbackScript().punch;
    if (punchScript) {
      const randomSpeaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
      buffers.push(await synthesizeElevenTTS(punchScript, randomSpeaker));
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

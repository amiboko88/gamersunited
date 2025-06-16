const sdk = require('microsoft-cognitiveservices-speech-sdk');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { getLineForUser, getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { registerTTSUsage } = require('./ttsQuotaManager');


const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;

const VOICE_MAP = {
  shimon: 'he-IL-AvriNeural',
  shirley: 'he-IL-HilaNeural'
};

function getSSML(text, speaker = 'shimon') {
  const voice = VOICE_MAP[speaker] || VOICE_MAP['shimon'];
  const clean = cleanText(text);

  const isInsult = /תמות|פתטי|זבל|קרציה|כישלון|עוף/.test(text);
  const isSexy = /אוי|יאו+|נמסתי|תירה בי|רטוב/.test(text);
  const isSarcastic = /ברוך הבא|מדהים|כל הכבוד|כפרה/.test(text);
  const isShort = text.length < 20;

  let style = 'general';
  let pitch = 'default';
  let rate = 'default';

  if (speaker === 'shimon') {
    style = isInsult ? 'angry' : isSarcastic ? 'embarrassed' : 'general';
    pitch = isShort ? '-10%' : '-5%';
    rate = isInsult ? 'fast' : 'slow';
  } else {
    style = isSexy ? 'cheerful' : isSarcastic ? 'chat' : 'friendly';
    pitch = isSexy ? '+15%' : '+5%';
    rate = 'medium';
  }

  return `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
           xmlns:mstts="http://www.w3.org/2001/mstts"
           xml:lang="he-IL">
      <voice name="${voice}">
        <mstts:express-as style="${style}">
          <prosody pitch="${pitch}" rate="${rate}">
            ${clean}
          </prosody>
        </mstts:express-as>
      </voice>
    </speak>`;
}

function cleanText(text) {
  return (text || '').trim()
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '...')
    .replace(/["<>]/g, '');
}

async function synthesizeAzureTTS(text, speaker = 'shimon') {
  const ssml = getSSML(text, speaker);
  const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig); // 💡 בלי audioConfig

  log(`🎙️ Azure TTS (${speaker}) – ${text.length} תווים`);

  return new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      async result => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          await registerTTSUsage(text.length, 1);
          await saveTTSAudit({ text, speaker, voice: VOICE_MAP[speaker], length: text.length });
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error(result.errorDetails || 'שגיאה כללית'));
        }
        synthesizer.close();
      },
      err => {
        synthesizer.close();
        reject(err);
      }
    );
  });
}


async function saveTTSAudit(data) {
  try {
    const db = admin.firestore();
    await db.collection('azureTtsAudit').add({ ...data, timestamp: new Date().toISOString() });
  } catch (e) {
    log(`⚠️ לא נשמר ל־Firestore: ${e.message}`);
  }
}

async function getShortTTSByProfile(member) {
  const userId = member.id;
  const displayName = member.displayName;
  const text = getLineForUser(userId, displayName);

  console.log(`🗣️ טקסט לשמעון עבור ${displayName}: ${text}`);

  return await synthesizeAzureTTS(text, 'shimon');
}

async function getPodcastAudioAzure(displayNames = [], ids = [], joinTimestamps = {}) {
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
    if (script.shimon) buffers.push(await synthesizeAzureTTS(script.shimon, 'shimon'));
    if (script.shirley) buffers.push(await synthesizeAzureTTS(script.shirley, 'shirley'));
  }

  if (participants.some(p => p.script)) {
    const punch = getRandomFallbackScript().punch;
    if (punch) {
      const randomSpeaker = Math.random() < 0.5 ? 'shimon' : 'shirley';
      buffers.push(await synthesizeAzureTTS(punch, randomSpeaker));
    }
  }

  return Buffer.concat(buffers);
}

function getRandomFallbackScript() {
  return fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)];
}

async function canUserUseTTS(userId, limit = 5) {
  return true;
}

module.exports = {
  synthesizeAzureTTS,
  getShortTTSByProfile,
  getPodcastAudioAzure,
  canUserUseTTS
};

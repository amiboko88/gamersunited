const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

function getUserProfileSSML(username) {
  const moods = [
    { rate: 'fast', pitch: '+15%' },
    { rate: 'slow', pitch: '-10%' },
    { rate: 'medium', pitch: '+20%' },
    { rate: 'default', pitch: '+0%' }
  ];
  const mood = moods[Math.floor(Math.random() * moods.length)];

  const voices = ['he-IL-HilaNeural', 'he-IL-AvriNeural'];
  const selectedVoice = voices[Math.floor(Math.random() * voices.length)];

  const fallbackLines = [
    "שלום שלום לשחקן האלמוני. תפתיע הפעם.",
    "שוב אתה? לא נמאס לך להפסיד?",
    "הבוט מזהה אותך... ומעדיף לשתוק.",
    "כנראה שנגמרו השחקנים אם אתה פה.",
    "תתאמץ היום קצת. נמאס לנו לחפות עליך.",
    "שוב נכנסת בלי תקווה – רק בונדה לה קקה הפעם?",
    "הקבוצה שלך כבר מתפללת שתחליק על גג ותתנתק.",
    "דודה של קאלי ביקשה ממך: אל תפתח קופסאות, תן דמג.",
    "אם אתה מתכוון רק לגנוח – תחסוך לכולנו את הכניסה.",
    "רק תזכור: הפעם האחרונה שעשית משהו טוב הייתה בטעות."
  ];

  const personalLines = playerProfiles[username];
  const hebrewText = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  return `
<speak version='1.0' xml:lang='he-IL'>
  <voice name='${selectedVoice}'>
    <prosody rate='${mood.rate}' pitch='${mood.pitch}'>
      ${hebrewText}
    </prosody>
  </voice>
</speak>
  `;
}

async function synthesizeAzureTTS(ssml) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const response = await axios.post(endpoint, ssml, {
    responseType: 'arraybuffer',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'discord-bot',
    },
  });

  if (!response.data || !(response.data instanceof Buffer || response.data instanceof Uint8Array)) {
    throw new Error("Azure לא החזיר Buffer תקני");
  }

  return response.data;
}

module.exports = {
  getUserProfileSSML,
  synthesizeAzureTTS
};

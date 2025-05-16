const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

// זיהוי לפי userId – העדפה חדשה
function getUserProfileSSML(userId) {
  const moods = [
    { rate: 'slow', pitch: '-15%' },
    { rate: 'slow', pitch: '-5%' },
    { rate: 'medium', pitch: '0%' },
    { rate: 'slow', pitch: '-10%' }
  ];
  const mood = moods[Math.floor(Math.random() * moods.length)];

  const voices = ['he-IL-HilaNeural', 'he-IL-AvriNeural'];
  const selectedVoice = voices[Math.floor(Math.random() * voices.length)];

  const fallbackLines = [
    "בוא נראה מה תעשה היום, חוץ מלהחיות את כולנו.",
    "אם גניחות היו נקודות – היית טופ 1.",
    "תפסיק לפתוח קופסאות ותתחיל לפתוח ראשים.",
    "רק תישבע לי שלא שכחת לחבר את המיקרופון.",
    "אם הפינג שלך היה מדד לאינטליגנציה... בוא פשוט נשתוק.",
    "יאללה, עוד אחד שנכנס כדי למות ראשון.",
    "נראה אותך מחזיק שלושה סיבובים בלי ragequit.",
    "זה לא זמן לעל האש. זה זמן לדמג.",
    "רק אל תדבר עם האישה באמצע סיבוב קרב.",
    "כמה קללות נספיק לשמוע ממך לפני שתמות?",
    "אם היית שקט כמו במשחק – אולי היינו מנצחים.",
    "תישאר עד הסוף – או שאתה שוב מתחמק מלהחיות?",
    "המשחק חיכה רק לך... להפסיד שוב.",
    "לפחות הפעם תכוון על האויב, לא על הקיר.",
    "נשוי + גיימר + עייף = חצי שחקן במקרה הטוב.",
    "זוכר שניצחנו? לא? גם אנחנו לא. היסטוריה עתיקה.",
    "אחי, רק תזכור: זה משחק, לא סשן פסיכולוגי.",
    "הבוט מקווה שהפעם תתפקד. גם הבוט מאבד תקווה.",
    "שמע, תעשה mute – או תעשה פלאים.",
    "הציפיות ממך כל כך נמוכות... אפילו אתה לא אכזבה יותר."
  ];

  const personalLines = playerProfiles[userId];
  const text = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  return `
<speak version='1.0' xml:lang='he-IL'>
  <voice name='${selectedVoice}'>
    <prosody rate='${mood.rate}' pitch='${mood.pitch}'>
      <break time="400ms"/>
      <emphasis level="moderate">${text}</emphasis>
      <break time="300ms"/>
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

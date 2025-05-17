const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

function getUserProfileSSML(userId) {
  const intros = [
    "היי חבר, שים לב...",
    "הבוט רוצה לומר משהו:",
    "ריכוז – מגיע punchline:",
    "וואו, עוד פעם אתה?",
    "אבו קאקא 🤡",
    "בונדה לה קאקא 💩",
    "אוווווויייייי!",
    "יוווווווווו!!",
    "תשתוק רגע, תקשיב:",
    "ברוך הבא למחלקת השפלה אישית"
  ];

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
    "לפחות הפעם תכוון על האויב, לא על הקיר.",
    "נשוי + גיימר + עייף = חצי שחקן במקרה הטוב.",
    "שיחקת פעם עם הידיים, לא עם המצפון?",
    "עוד יום, עוד סיבוב, עוד תירוץ.",
    "זוכר שניצחנו? לא? גם אנחנו לא. היסטוריה עתיקה.",
    "הבוט מקווה שהפעם תתפקד. גם הבוט מאבד תקווה.",
    "הציפיות ממך כל כך נמוכות... אפילו אתה לא אכזבה יותר."
  ];

  const moods = [
    { rate: 'medium', pitch: '-5%' },
    { rate: 'medium', pitch: '0%' },
    { rate: 'medium', pitch: '+5%' },
    { rate: 'fast', pitch: '0%' },
    { rate: 'fast', pitch: '-5%' }
  ];

  const mood = moods[Math.floor(Math.random() * moods.length)];
  const intro = intros[Math.floor(Math.random() * intros.length)];
  const personalLines = playerProfiles[userId];
  const rawText = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  const segments = rawText.split(/(?<=[.!?])\s+/); // חלק את הטקסט לפסקאות קצרות
  const emphasizedSegments = segments.map((part, i) => {
    if (part.toLowerCase().includes('ragequit')) {
      return `<lang xml:lang='en-US'>${part}</lang>`;
    }
    const emphasis = i === segments.length - 1 ? 'strong' : 'moderate';
    return `<emphasis level='${emphasis}'>${part}</emphasis>`;
  });

  const speechBody = emphasizedSegments.join('<break time="300ms"/>');

  return `
<speak version='1.0' xml:lang='he-IL'>
  <voice name='he-IL-HilaNeural'>
    <prosody rate='slow'>
      <break time='500ms'/>${intro}<break time='300ms'/>
    </prosody>
  </voice>
  <voice name='he-IL-AvriNeural'>
    <prosody rate='${mood.rate}' pitch='${mood.pitch}'>
      ${speechBody}
    </prosody>
  </voice>
</speak>`;
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
      'User-Agent': 'discord-bot'
    },
  });

  const data = Buffer.from(response.data);
  if (!data || data.length < 1000) {
    throw new Error("Azure לא החזיר Buffer תקני או תקציר");
  }

  return data;
}

module.exports = {
  getUserProfileSSML,
  synthesizeAzureTTS
};

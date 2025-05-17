const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

function getUserProfileSSML(userId) {
  const intros = [
    "היי חבר, שים לב...",
    "טוב, הפעם זה מגיע מכיוון הבוט:",
    "הנה משפט מעודד, או שלא:",
    "ריכוז... ריכוז...",
    "אבו קאקא!",
    "בונדה לה קאקא 🤡",
    "אוווווויייייי!",
    "יוווווווווו!!",
    "תכין את עצמך, הנה זה בא:",
    "תשתוק רגע, תקשיב:",
  ];

  const moods = [
    { rate: 'slow', pitch: '-5%' },
    { rate: 'medium', pitch: '-5%' },
    { rate: 'medium', pitch: '0%' },
    { rate: 'medium', pitch: '+5%' }
  ];
  const mood = moods[Math.floor(Math.random() * moods.length)];

  const intro = intros[Math.floor(Math.random() * intros.length)];

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
    "הציפיות ממך כל כך נמוכות... אפילו אתה לא אכזבה יותר.",
    "כל פעם שאתה נכנס, מישהו מתנתק.",
    "שיחקת פעם עם הידיים, לא עם המצפון?",
    "מהר! לפני שהחיבור שלך ייפול שוב.",
    "אם היה תואר ליותר מדי דיבורים – היית בטופ.",
    "עוד יום, עוד סיבוב, עוד תירוץ."
  ];

  const personalLines = playerProfiles[userId];
  const text = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  return `
<speak version='1.0' xml:lang='he-IL'>
  <voice name='he-IL-HilaNeural'>
    <prosody rate='slow'>
      <break time="500ms"/>
      ${intro}
      <break time="400ms"/>
    </prosody>
  </voice>
  <voice name='he-IL-AvriNeural'>
    <prosody rate='${mood.rate}' pitch='${mood.pitch}'>
      <emphasis level="strong">${text}</emphasis>
      <break time="500ms"/>
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

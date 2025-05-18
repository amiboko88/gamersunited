// 📁 tts/ttsEngine.js – גרסה מלאה עם תמיכה ב־displayName
const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

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

function getUserProfileGoogle(userId, displayName = 'שחקן אלמוני') {
  const intro = intros[Math.floor(Math.random() * intros.length)];
  const personalLines = playerProfiles[userId];
  const rawText = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : `${displayName}, אתה לא ברשימה, אבל הבוט כבר מזהה בושה מרחוק...`;

  const fullText = `${intro} ${rawText}`;
  return fullText;
}

async function synthesizeGoogleTTS(text) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`;

  const voiceName = randomGoogleVoice();
  const rate = randomRate();
  const pitch = randomPitch();

  const payload = {
    input: { text },
    voice: {
      languageCode: 'he-IL',
      name: voiceName
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: rate,
      pitch: pitch
    }
  };

  try {
    const response = await axios.post(endpoint, payload);
    const audioContent = response.data.audioContent;
    if (!audioContent) throw new Error('❌ Google TTS לא החזיר תוכן קול');
    return Buffer.from(audioContent, 'base64');
  } catch (err) {
    console.error(`❌ שגיאה בבקשת Google TTS:`, err.response?.data || err.message);
    throw err;
  }
}

function randomGoogleVoice() {
  const voices = [
    'he-IL-Standard-A', 'he-IL-Standard-B',
    'he-IL-Wavenet-A', 'he-IL-Wavenet-B',
    'he-IL-Wavenet-C', 'he-IL-Wavenet-D'
  ];
  return voices[Math.floor(Math.random() * voices.length)];
}

function randomRate() {
  const rates = [0.95, 1.0, 1.05, 1.1];
  return rates[Math.floor(Math.random() * rates.length)];
}

function randomPitch() {
  const pitches = [-2.0, 0.0, 2.0, 4.0];
  return pitches[Math.floor(Math.random() * pitches.length)];
}

module.exports = {
  getUserProfileGoogle,
  synthesizeGoogleTTS
};

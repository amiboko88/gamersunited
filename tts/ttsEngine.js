const axios = require('axios');
const { playerProfiles } = require('../data/profiles');

const intros = [
  "שמע, יש גבול למה שהבוט מוכן לסבול:",
  "הודעת מערכת: הבושה בדרך...",
  "תתכונן ל־roast קטן:",
  "שקט שם! הבוט מתחיל לדבר:",
  "הנה זה מגיע... תחזיק חזק:",
  "כנס עם נשמה, אל תצא כמו סמרטוט:",
  "תירוץ לא תקבל, רק תזכורת שאתה כאן:",
  "אין לך פרופיל? לא נורא, יש בוז:"
];

const fallbackLines = [
  (name) => `${name}, אתה לא ברשימה, אבל הבוט כבר מזהה בושה מרחוק...`,
  (name) => `${name}, גם בלי פרופיל – עדיין אפשר לשפוך בוז.`,
  (name) => `${name}, אין לך פרופיל, אבל יש לך ריח של הפסדים.`,
  (name) => `${name}, ברוך הבא למגרש של הגדולים. תנסה לשרוד.`,
  (name) => `${name}, שחקן אנונימי עם ביצועים פומביים.`,
  (name) => `${name}, לא מצאנו אותך ברשימה – כנראה בגלל הביצועים.`,
  (name) => `${name}, גם אפס יכול להדהים – אבל אתה לא.`,
  (name) => `${name}, אפילו האישה שלך לא הייתה סולחת על משחק כזה.`,
  (name) => `${name}, בוא נודה בזה: הבוט מתבייש לקרוא לך גיימר.`,
  (name) => `${name}, לא מצאנו לך פרופיל – נסתפק באכזבה.`,
  (name) => `${name}, תוסיף את עצמך לרשימת ההשפלות בבקשה.`,
  (name) => `${name}, ברוך הבא לפינת הפדיחה הלא רשמית.`,
  (name) => `${name}, תצטרף לרשימה או תישאר כבדיחה.`,
  (name) => `${name}, גם בלי פרופיל – תמיד יש מקום אחרון בטבלת הכישלונות.`,
  (name) => `${name}, היית חייב להיכנס עכשיו? הבוט בדיוק נח.`,
];

function getUserProfileGoogle(userId, displayName = 'שחקן') {
  const intro = intros[Math.floor(Math.random() * intros.length)];
  const personalLines = playerProfiles[userId];

  const rawText = personalLines
    ? personalLines[Math.floor(Math.random() * personalLines.length)]
    : fallbackLines[Math.floor(Math.random() * fallbackLines.length)](displayName);

  return `${intro} ${rawText}`;
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

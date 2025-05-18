// 📁 tts/ttsEngine.eleven.js – שימוש מחודש ב־PlayHT במקום ElevenLabs
const axios = require('axios');
const { log } = require('../utils/logger');

// 🔐 משתני סביבה
const PLAYHT_API_KEY = process.env.PLAYHT_API_KEY;
const PLAYHT_USER_ID = process.env.PLAYHT_USER_ID; // נדרש על ידם
const VOICE_ID = 'Mary Conversational'; // קול עברי "סביר"

const funnyLines = [
  "מה זה השקט הזה? אתם בקבוצת יוגה או משחק יריות?",
  "מי הביא את הנוב הזה שוב פעם?",
  "תתחילו לשחק, אני לא באתי ללטף לכם את האוזן!",
  "יאללה כנסו לקרב – או שאני פותח סשן חיבוקים.",
  "כל פעם שאני שומע אתכם – הפינג שלי צונח מהבושה.",
  "מישהו פה זז? או שזה ערב גופות?",
  "אני לא אומר שאתם גרועים... אני צועק את זה בקול.",
  "תגידו, מתי המשחק מתחיל? כי עכשיו זה נראה כמו מסיבת גמדים.",
  "וואו, לא ראיתי כאלה ביצועים מאז שראיתי גמל על סקייטבורד.",
  "מי שחושב שהוא MVP – שירים יד. עכשיו תוריד ותחזור למציאות.",
  "הכישרון כאן כל כך נדיר, שהוא ברמת מיתוס.",
  "הבוט מדבר – כי לפחות מישהו פה תורם משהו.",
  "מה זה, קומונה של עצלנים?",
  "3 שחקנים נכנסים לערוץ... ומאכזבים כרגיל.",
  "אם הייתי נאנח כל פעם שאתם מפספסים – לא היה לי קול.",
  "חחחחחח... סליחה, פשוט נזכרתי איך אתם משחקים.",
  "נו באמת, עוד פעם עם אותם תירוצים?",
  "הבוט פה. תשחקו כאילו יש לכם חיים.",
  "כל מי שנמצא פה – תתבייש. כל מי שלא – צדק.",
  "מה יש יותר? כישרון או תלונות בצ'אט?",
  "יאללה יאללה, שימי פה. הגיע הזמן לקצת השפלות קוליות.",
  "וואו, זה צוות או מופע ליצנות נייד?",
  "אני מדבר ואתם שותקים? כמו תמיד בקרב.",
  "שקט!! עכשיו תנו לי לנסות להציל את מה שנשאר מהמוניטין של השרת הזה."
];

function getRandomElevenLine() {
  return funnyLines[Math.floor(Math.random() * funnyLines.length)];
}

async function synthesizeElevenTTS(text) {
  try {
    const response = await axios.post(
      'https://api.play.ht/api/v2/tts',
      {
        voice: VOICE_ID,
        text,
        quality: 'high',
        speed: 1.0,
        sample_rate: 24000,
        output_format: 'mp3'
      },
      {
        responseType: 'arraybuffer',
        headers: {
          Authorization: `Bearer ${PLAYHT_API_KEY}`,
          'X-User-Id': PLAYHT_USER_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data || response.data.length < 1000) {
      throw new Error('🔇 קובץ שמע לא תקין מ־PlayHT');
    }

    // נרשום בלוג כמה תווים השתמשנו
    log(`🎙️ שימוש ב־PlayHT – ${text.length} תווים`);

    return Buffer.from(response.data);
  } catch (err) {
    console.error('❌ שגיאה ב־PlayHT:', err.message);
    throw err;
  }
}

module.exports = {
  synthesizeElevenTTS,
  getRandomElevenLine
};

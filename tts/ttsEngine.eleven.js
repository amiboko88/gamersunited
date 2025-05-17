// 📁 tts/ttsEngine.eleven.js – TTS דינמי עם ElevenLabs
const axios = require('axios');

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const VOICE_ID = process.env.ELEVEN_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // קול ברירת מחדל

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

async function synthesizeElevenTTS(text) {
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const response = await axios.post(endpoint, {
    text,
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.6
    },
    model_id: 'eleven_multilingual_v2'
  }, {
    responseType: 'arraybuffer',
    headers: {
      'xi-api-key': ELEVEN_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  return Buffer.from(response.data);
}

function getRandomElevenLine() {
  return funnyLines[Math.floor(Math.random() * funnyLines.length)];
}

module.exports = {
  synthesizeElevenTTS,
  getRandomElevenLine
};

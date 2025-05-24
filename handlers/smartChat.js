// 📁 handlers/smartChat.js
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const moods = ['סרקסטי', 'גס רוח', 'רגיש', 'מאוהב', 'כועס', 'שובב', 'מפרגן'];
const confusedTriggers = [
  'מה זה', 'איפה המשחק', 'רציתי לענות', 'למה מחקת',
  'היה שאלה', 'פספסתי', 'המשחק נעלם', 'למה נמחק', 'מה פספסתי', 'חיכיתי'
];
const complimentTriggers = ['כל הכבוד', 'תותח', 'אהבתי', 'חזק', 'מצחיק', 'יפה'];
const teasingTriggers = ['סתום', 'חחחח', 'די', 'שתוק', 'קוף'];

let lastGameTimestamp = null;

function getMoodFromContent(text) {
  const lower = text.toLowerCase();
  if (confusedTriggers.some(w => lower.includes(w))) return 'מבולבל';
  if (complimentTriggers.some(w => lower.includes(w))) return 'מפרגן';
  if (teasingTriggers.some(w => lower.includes(w))) return 'שובב';
  if (lower.includes('בן זונה') || lower.includes('תמות') || lower.includes('זין')) return 'כועס';
  return getRandomMood();
}

function getRandomMood() {
  return moods[Math.floor(Math.random() * moods.length)];
}

function containsEmoji(text) {
  return /[\p{Emoji}]/u.test(text);
}

function isLink(text) {
  return text.includes('http') || text.includes('www.');
}

function isBattleTag(text) {
  return /#[0-9]{3,5}/.test(text);
}

function isTargetingBot(text) {
  const lower = text.toLowerCase();
  return ['שמעון', 'shim', 'bot'].some(name => lower.includes(name));
}

function isBirthdayMention(text) {
  const lower = text.toLowerCase();
  return lower.includes('יום הולדת') || lower.includes('נולדתי') || lower.includes('בן') || lower.includes('בת');
}

function isConfusedAboutGame(text) {
  const lower = text.toLowerCase();
  return confusedTriggers.some(trigger => lower.includes(trigger));
}

function minutesSince(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / 60000;
}

async function smartRespond(message, moodOverride = null) {
  const content = message.content.trim();
  const mood = moodOverride || getMoodFromContent(content);

  const prompt = `אתה שמעון, בוט קהילתי ישראלי לקהילת גיימרים.
מצב הרוח שלך: ${mood}.
מישהו בשרת כתב:
"${content}"

תגיב בעברית, כאילו אתה אחד מהחבר'ה. קצר, סרקסטי, מצחיק או מקורי.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.9
    });

    const reply = response.choices[0]?.message?.content;
    if (reply) await message.reply(reply);
  } catch (err) {
    console.error('❌ smartRespond Error:', err);
  }
}

module.exports = async function smartChat(message) {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  const recentlyHadGame = minutesSince(lastGameTimestamp) <= 2;
  const confused = isConfusedAboutGame(content);
  const targetsBot = isTargetingBot(content);
  const reacting = containsEmoji(content) || isLink(content) || isBattleTag(content) || isBirthdayMention(content);

  if (recentlyHadGame && confused) {
    return smartRespond(message, 'מבולבל');
  }

  if (targetsBot || reacting || confused) {
    return smartRespond(message);
  }
};

module.exports.smartRespond = smartRespond;

module.exports.setLastGameTimestamp = function () {
  lastGameTimestamp = new Date();
};

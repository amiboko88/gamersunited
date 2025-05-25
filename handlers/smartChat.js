const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STAFF_CHANNEL_ID = '881445829100060723'; // ערוץ STAFF

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

// 🧠 שימוש ב־GPT לפי מודל
async function tryModel({ model, prompt }) {
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.9
  });
  return response.choices[0]?.message?.content;
}

async function smartRespond(message, moodOverride = null) {
  const content = message.content.trim();
  const mood = moodOverride || getMoodFromContent(content);

  const prompt = `אתה שמעון, בוט קהילתי ישראלי לקהילת גיימרים.
מצב הרוח שלך: ${mood}.
מישהו בשרת כתב:
"${content}"

תגיב בעברית, כאילו אתה אחד מהחבר'ה. קצר, סרקסטי, מצחיק או מקורי.`

  let reply = null;

  try {
    reply = await tryModel({ model: 'gpt-4o', prompt });
  } catch (err) {
    console.error('❌ GPT-4o נכשל:', err.message);

    // שלח שגיאה ל־STAFF
    const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
    if (channel) {
      channel.send(`⚠️ GPT-4o נפל: \`${err.code || err.status}\` – מנסה gpt-3.5-turbo...`);
    }

    try {
      reply = await tryModel({ model: 'gpt-3.5-turbo', prompt });
    } catch (err2) {
      console.error('❌ גם GPT-3.5 נכשל:', err2.message);

      if (channel) {
        channel.send(`🚨 גם GPT-3.5-turbo נפל: \`${err2.code || err2.status}\``);
      }

      return; // לא מגיב – גם 3.5 נפל
    }
  }

  if (reply) {
    await message.reply(reply);
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

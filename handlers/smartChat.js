// 📁 handlers/smartChat.js
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

const moods = [
  'סרקסטי', 'גס רוח', 'רגיש', 'מאוהב', 'כועס', 'שובב', 'מפרגן'
];

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

module.exports = async function smartChat(message) {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  const mentionedBot = lower.includes('שמעון') || lower.includes('bot') || lower.includes('shim');
  const saidBirthday = lower.includes('יום הולדת') || lower.includes('נולדתי') || lower.includes('בן') || lower.includes('בת');

  const shouldRespond =
    mentionedBot ||
    containsEmoji(content) ||
    isLink(content) ||
    isBattleTag(content) ||
    saidBirthday;

  if (!shouldRespond) return;

  const mood = getRandomMood();

  const prompt = `אתה שמעון, בוט קהילתי גיימרי ישראלי, מדבר כמו שחקן אמיתי עם אישיות בולטת.
מצב הרוח שלך כרגע: ${mood}.
התגובה צריכה להיות בעברית בלבד, סרקסטית, מצחיקה או מקורית, כאילו אתה מגיב על מה שמישהו אמר בשרת דיסקורד:
"${content}"`;

  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.9
    });

    const reply = response.data.choices[0].message.content;
    await message.reply(reply);
  } catch (err) {
    console.error('❌ smartChat Error:', err);
  }
};

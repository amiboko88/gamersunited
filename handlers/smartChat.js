// 📁 smartChat.js – גרסה מתקדמת 2026, AI סרקסטי, rate limit, firestore, personal profiles

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = require("../utils/firebase");
const { getScriptByUserId } = require("../data/fifoLines"); // אופציונלי, אם תרצה פרופיל אישי

const STAFF_CHANNEL_ID = '881445829100060723'; // ערוץ STAFF
const ADMIN_ROLE_NAME = 'ADMIN'; // לשנות בהתאם לרול האמיתי שלך
const USER_COOLDOWN_SEC = 8; // כמה שניות בין תגובה לתגובה לאותו יוזר

const lastReplyPerUser = new Map(); // { userId: timestamp }
const recentReplies = new Set(); // מונע חזרה על אותה תגובה פעמיים ברצף

const moods = ['סרקסטי', 'גס רוח', 'רגיש', 'מאוהב', 'כועס', 'שובב', 'מפרגן', 'חפפן', 'עצוב'];
const confusedTriggers = [ 'מה זה', 'איפה המשחק', 'רציתי לענות', 'למה מחקת', 'היה שאלה', 'פספסתי', 'המשחק נעלם', 'למה נמחק', 'מה פספסתי', 'חיכיתי' ];
const complimentTriggers = [ 'כל הכבוד', 'תותח', 'אהבתי', 'חזק', 'מצחיק', 'יפה', 'פגז', 'תודה' ];
const teasingTriggers = [ 'סתום', 'חחח', 'די', 'שתוק', 'קוף', 'מפגר', 'בן זונה', 'זין', 'מטומטם', 'בוט דפוק' ];

const BLACKLISTED_CHANNELS = [
  // הוסף לכאן ערוצים ש*לא* תרצה שהבוט יענה בהם (למשל SUPPORT או STAFF)
  // '123456789012345678'
];

// =============== כלי עזר =================

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
  return ['שמעון', 'shim', 'bot', 'שמעון בוט'].some(name => lower.includes(name));
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

function isOffensive(text) {
  return teasingTriggers.some(word => text.includes(word));
}

function isAdmin(member) {
  return member.permissions.has('Administrator') || member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME);
}

// ========== RATE LIMIT ==============

function isUserRateLimited(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < USER_COOLDOWN_SEC * 1000;
}
function setUserCooldown(userId) {
  lastReplyPerUser.set(userId, Date.now());
}

// ========== PROMPT GENERATION ==============

function createPrompt({ userText, mood, displayName, profileLine, isAdminUser }) {
  // יותר קונטקסט, יותר "ירידות" והומור
  let base = `אתה שמעון, בוט קהילתי ישראלי לגיימרים בוגרים (25+). מצב הרוח שלך: ${mood}.`;
  if (isAdminUser) base += ` המשתמש שמולך הוא אדמין – תכבד אותו אבל תתחכם!`;
  if (profileLine) base += ` פרופיל אישי: "${profileLine}"`;

  return `${base}
מישהו כתב: "${userText}"
תגיב בעברית בלבד. תהיה קצר, סרקסטי, ציני, מקורי – ותמיד עם וייב של גיימרים.`;
}

// ========== FIRESTORE LOGGING ==============

async function logToFirestore(message, reply, mood) {
  try {
    await db.collection("aiReplies").add({
      userId: message.author.id,
      username: message.author.username,
      displayName: message.member?.displayName,
      channelId: message.channel.id,
      text: message.content,
      gptReply: reply,
      mood,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("❌ Firestore log error:", err.message);
  }
}

// ========== תגובה עם AI ==============

async function tryModel({ model, prompt }) {
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.93
  });
  return response.choices[0]?.message?.content;
}

async function smartRespond(message, moodOverride = null) {
  const content = message.content.trim();
  const member = message.member;
  const userId = message.author.id;

  // 1. RATE LIMIT
  if (isUserRateLimited(userId)) return;
  setUserCooldown(userId);

  // 2. BLACKLIST
  if (BLACKLISTED_CHANNELS.includes(message.channel.id)) return;

  // 3. פרופיל אישי (אופציונלי)
  let profileLine = null;
  try {
    profileLine = getScriptByUserId ? getScriptByUserId(userId)?.shimon || null : null;
  } catch { profileLine = null; }

  // 4. דינמיקת mood ורול
  const mood = moodOverride || getMoodFromContent(content);
  const isAdminUser = member ? isAdmin(member) : false;
  const displayName = member?.displayName || message.author.username || "משתמש";

  const prompt = createPrompt({ userText: content, mood, displayName, profileLine, isAdminUser });
  let reply = null;

  // הימנע מתגובה זהה פעמיים ברצף
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      reply = await tryModel({ model: attempt === 0 ? 'gpt-4o' : 'gpt-3.5-turbo', prompt });
      if (!recentReplies.has(reply)) break;
    } catch (err) {
      if (attempt === 0) {
        const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
        if (channel) channel.send(`⚠️ GPT-4o נפל: ${err.code || err.status}`);
      }
    }
  }
  if (!reply) return;

  recentReplies.add(reply);
  if (recentReplies.size > 6) recentReplies.delete([...recentReplies][0]); // שמור 6 אחרונים

  // תגובה צבעונית/הומוריסטית – אפשר גם לשלב Embed/GIF/Sticker לפי תוכן
  await message.reply({ content: reply });
  logToFirestore(message, reply, mood).catch(() => {});

  // אפשרות: הוסף פה שילוב עם gifs/embeds לפי מצב רוח
}

module.exports = async function smartChat(message) {
  if (message.author.bot) return;
  if (message.content.startsWith('/')) return;

  // דילוג על ערוצים מסויימים
  if (BLACKLISTED_CHANNELS.includes(message.channel.id)) return;

  const content = message.content.trim();

  const confused = isConfusedAboutGame(content);
  const targetsBot = isTargetingBot(content);
  const reacting = containsEmoji(content) || isLink(content) || isBattleTag(content) || isBirthdayMention(content);

  // טריגר ראשי: תגיב רק אם פנו לשמעון/ירדו עליו/שאלה/קללה/חגיגה
  if (targetsBot || reacting || confused || isOffensive(content)) {
    return smartRespond(message);
  }
};

module.exports.smartRespond = smartRespond;

module.exports.setLastGameTimestamp = function () {
  lastGameTimestamp = new Date();
};

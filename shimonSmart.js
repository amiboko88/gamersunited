const { OpenAI } = require("openai");
const db = require("./utils/firebase");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { updateXP } = require("./telegramLevelSystem");

const lastReplyPerUser = new Map();
const recentMessagesPerChat = new Map(); // chatId -> [userIds]
const repliedInChat = new Map(); // chatId -> timestamp
const pendingReplies = new Map(); // chatId -> {userId, text, name, timeoutId}
const MAX_RECENT = 5;

const offensiveWords = [
  "זין", "חרא", "בן זונה", "כוס", "זונה", "מניאק", "קקי", "שיט", "בהמה",
  "מפגר", "נכה", "טיפש", "מטומטם", "שמן", "מכוער", "עקום", "עיוור", "אידיוט",
  "ילד כאפות", "פח", "אפס", "אונס", "חולה נפש",
  "כ*ס", "זי*ן", "ז**נה", "ש**ט", "כוs", "כוסית",
  "fuck", "shit", "bitch", "dick", "pussy", "retard", "whore", "slut", "idiot",
  "f*ck", "sh*t", "b!tch", "pu$$y", "ret@rd", "wh*re"
];

const niceWords = [
  "תודה", "תותח", "אלוף", "מלך", "נסיך", "חיים שלי", "אחלה", "כפרה עליך", "מהמם",
  "awesome", "great", "legend", "respect", "well done", "amazing", "בכיף", "טיל", "חלום"
];

const questionWords = [
  "מה", "למה", "איך", "כמה", "מי", "איפה", "האם", "אפשר", "מתי", "שאלה", "תגיד",
  "what", "why", "how", "who", "when", "where", "can", "should", "is it"
];

const triggerWords = ["שמעון", "שימי", "shim", "שמשון", "בוט"];

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 10000;
}

function isOffensive(text) {
  return offensiveWords.some(w => text.toLowerCase().includes(w));
}
function isNice(text) {
  return niceWords.some(w => text.toLowerCase().includes(w));
}
function isQuestion(text) {
  return text.endsWith("?") || questionWords.some(w => text.toLowerCase().startsWith(w));
}
function isTrigger(text) {
  return triggerWords.some(w => text.toLowerCase().includes(w));
}
function isLink(text) {
  return /(https?:\/\/[^\s]+)/i.test(text);
}
function isSticker(ctx) {
  return !!ctx.message?.sticker;
}
function isPhoto(ctx) {
  return !!ctx.message?.photo;
}
function updateRecent(chatId, userId) {
  const recent = recentMessagesPerChat.get(chatId) || [];
  recent.push(userId);
  if (recent.length > MAX_RECENT) recent.shift();
  recentMessagesPerChat.set(chatId, recent);
}

function isPrivateChat(chatId) {
  const recent = recentMessagesPerChat.get(chatId) || [];
  const unique = [...new Set(recent)];
  return unique.length === 2;
}

function alreadyRepliedRecently(chatId) {
  const last = repliedInChat.get(chatId) || 0;
  return (Date.now() - last) < 60000;
}

function createPrompt(text, name) {
  if (isOffensive(text)) {
    return `משתמש בשם ${name} שלח הודעה בוטה: "${text}"
אתה שמעון – בוט חצוף בלי גבולות. תן לו קללה מתוחכמת, בלי פילטרים, שורה אחת.`;
  }
  if (isNice(text)) {
    return `משתמש בשם ${name} היה נחמד ואמר: "${text}"
תן לו תגובת קריצה, כמו גבר גבר שלא ממש מתרגש אבל כן מכיר בהערכה.`;
  }
  if (isQuestion(text)) {
    return `משתמש בשם ${name} שואל: "${text}"
ענה בשורה אחת בלבד, טון סמכותי וחותך, כאילו אין לך זמן לבולשיט.`;
  }
  if (isTrigger(text)) {
    const simple = text.trim().toLowerCase().replace(/[\s"׳״'“”`.,\-–…]/g, "");
    if (["שמעון", "שימי", "shim", "שמשון"].includes(simple)) {
      return `מישהו רק אמר את השם שלך בלי סיבה.
תן לו עקיצה סרקסטית כאילו הוא לא מצא מה להגיד אז זרק "שמעון" סתם כדי לקבל תשומת לב.`;
    }
    return `מישהו פונה אליך ואומר: "${text}"
ענה כאילו אתה מזהה אותו אישית, עם חצי חיוך, קצת לעג, שורה חכמה אחת.`;
  }
  if (isLink(text)) {
    return `מישהו שלח קישור: "${text}"
תגיב בלעג, כאילו שלחו לינק בלי הסבר. שורה אחת צינית.`;
  }
  return `המשתמש כתב: "${text}"
ענה בסגנון ישראלי עוקצני – שורה אחת, לא מתחנפת.`;
}

function pickEmoji(text) {
  const categories = {
    offensive: ["😏", "😈", "🧠"],
    nice: ["🙏", "😇", "💖"],
    question: ["🤔", "🧐", "❓"],
    trigger: ["😎", "🧔", "😏"],
    link: ["🔗", "🧷", "📎"],
    default: ["😉", "🙂", "🫠"]
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (isOffensive(text)) return pick(categories.offensive);
  if (isNice(text)) return pick(categories.nice);
  if (isQuestion(text)) return pick(categories.question);
  if (isTrigger(text)) return pick(categories.trigger);
  if (isLink(text)) return pick(categories.link);
  return pick(categories.default);
}

function formatShimonReply(name, text, emoji = "") {
  const rtl = "\u200F";
  text = text
    .replace(/^[\s"׳״'“”`.,\-–…]*ש(מעון|ימי|משון)[\s"׳״'“”`.,\-–:]*?/i, "")
    .replace(/שמעון/gi, "")
    .replace(/^["“”'`׳"״\s\u200E\u200F]+|["“”'`׳"״\s\u200E\u200F]+$/g, "")
    .replace(/[\u200E\u200F]+/g, "")
    .trim();
  return `${rtl}${name}, ${text}${emoji ? " " + emoji : ""}`;
}

async function smartReply(chatId, userId, name, text, ctx) {
  const prompt = createPrompt(text, name);
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 100
    });

    let reply = gptRes.choices?.[0]?.message?.content?.trim();
    if (!reply) return false;

    const emoji = pickEmoji(text);
    reply = formatShimonReply(name, reply, emoji);
    await ctx.reply(reply, { parse_mode: "HTML" });

    await updateXP({ id: userId, first_name: name, username: ctx.from.username, text });

    await db.collection("smartLogs").add({
      userId,
      name,
      text,
      reply,
      type: "smartGPT",
      timestamp: Date.now()
    });

    repliedInChat.set(chatId, Date.now());
    return true;
  } catch (err) {
    console.error("❌ GPT שגיאה:", err);
    return false;
  }
}

async function handleSmartReply(ctx) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const name = ctx.from?.first_name || "חבר";
  const text = ctx.message?.text?.trim();
  if (!userId || !text || text.length < 2 || isSticker(ctx) || isPhoto(ctx)) return false;
  updateRecent(chatId, userId);

  if (isPrivateChat(chatId)) return false;
  if (alreadyRepliedRecently(chatId)) return false;
  if (!isTrigger(text) && !isQuestion(text)) return false;
  if (pendingReplies.has(chatId)) return false;
  if (isUserSpammedRecently(userId)) return false;
  lastReplyPerUser.set(userId, Date.now());

  // 🕒 השהיה של 60 שניות לפני תגובה
  pendingReplies.set(chatId, {
    userId,
    text,
    name,
    timeoutId: setTimeout(async () => {
      const recent = recentMessagesPerChat.get(chatId) || [];
      const others = recent.filter(uid => uid !== userId);
      if (others.length === 0) {
        await smartReply(chatId, userId, name, text, ctx);
      }
      pendingReplies.delete(chatId);
    }, 60000)
  });

  return false;
}

module.exports = handleSmartReply;

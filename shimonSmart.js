const { OpenAI } = require("openai");
const db = require("./utils/firebase");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { updateXP } = require("./telegramLevelSystem");

const lastReplyPerUser = new Map();

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 10000; // פחות מ־10 שניות
}

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

const triggerWords = ["שמעון", "שימי", "shim", "שמשון"];

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

async function handleSmartReply(ctx) {
  const userId = ctx.from?.id;
  const name = ctx.from?.first_name || "חבר";
  const text = ctx.message?.text?.trim();
  if (!userId || !text || text.length < 2 || isSticker(ctx) || isPhoto(ctx)) return false;
  if (isUserSpammedRecently(userId)) return false;

  lastReplyPerUser.set(userId, Date.now());

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

    reply = reply.replace(/^["“”'`׳"״\s]+|["“”'`׳"״\s]+$/g, "").trim();
    reply = `\u200F${reply}`; // RTL תקני

    await ctx.reply(reply, { parse_mode: "HTML" });

    // ✅ עדכון XP אמיתי גם בתגובה חכמה
    await updateXP({
      id: ctx.from.id,
      first_name: ctx.from.first_name,
      username: ctx.from.username,
      text
    });

    await db.collection("smartLogs").add({
      userId,
      name,
      text,
      reply,
      type: "smartGPT",
      timestamp: Date.now()
    });

    return true;
  } catch (err) {
    console.error("❌ GPT שגיאה:", err);
    return false;
  }
}

module.exports = handleSmartReply;

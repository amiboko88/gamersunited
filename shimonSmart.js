// 📁 shimonSmart.js – גרסה משודרגת עם GPT-4o לכל קטגוריה

const { OpenAI } = require("openai");
const db = require("./utils/firebase");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lastReplyPerUser = new Map();

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 10000; // פחות מ־10 שניות
}

// קטגוריות חדשות:
const offensiveWords = [
  // עברית — בוטה רגיל
  "זין", "חרא", "בן זונה", "כוס", "זונה", "מניאק", "קקי", "שיט", "סמרטוט", "בהמה", "חמור",
  "מפגר", "מוגבל", "נכה", "דביל", "טמבל", "טיפש", "סתום", "מטומטם", "שמן", "כיעור", "מכוער",
  "נודניק", "עקום", "עיוור", "חרש", "מפגר", "מפגרת", "חלאה", "פח אשפה", "נבלה", "בהמה",
  "מוצץ", "אפס", "חסר חיים", "בן כלב", "ילד כאפות", "פרחה", "ערס", "זבל", "פח", "פסולת", "עלוב",
  "סחי", "קרציה", "אידיוט", "כלב", "קוף", "אונס", "נאנס", "אנס", "חולה נפש",

  // עברית — כתיב מרומז
  "כ*ס", "זי*ן", "ז**נה", "ח*רא", "ש**ט", "זיoן", "חaרה", "כוs", "פaח", "ש-יט", "זי—ן", "זינ", "כוסית", "ילד קקות",

  // אנגלית — בסיסית + בוטה
  "fuck", "shit", "bitch", "asshole", "dick", "pussy", "retard", "faggot", "whore", "slut", "moron", "idiot", "stupid", "loser", "trash", "garbage",

  // אנגלית — כתיב מתוחכם/מצונזר
  "f*ck", "sh*t", "b!tch", "a$$hole", "d!ck", "pu$$y", "f@g", "ret@rd", "wh*re", "sl*t", "dumbass", "mf", "motherfucker"
];

const niceWords = [
  // עברית - פרגון
  "תודה", "תותח", "אלוף", "מלך", "נסיך", "חיים שלי", "אח", "אחלה", "תותח על", "כפרה עליך", "פצצה", "גדול", "מהמם", "חתיך", "חמוד", "אהוב", "אמיתי", "מושלם", "מטורף", "גבר", "אגדה", "מדהים", "חזק", "יפה", "בכיף",

  // אנגלית - חיובי
  "thanks", "respect", "cool", "legend", "awesome", "nice", "well done", "good job", "appreciate", "great", "amazing", "bravo", "cheers",

  // סלנג משולב
  "איזה תותח", "כל הכבוד", "כל הכפיים", "בכיף אחי", "תודה גבר", "מלך אמיתי", "טיל בליסטי", "טיל", "חלום", "מאסטר", "על חלל"
];

const questionWords = [
  // פתיחות לשאלה
  "מה", "למה", "איך", "כמה", "מי", "איפה", "האם", "יש", "אפשר", "בא לך", "בא לי", "מתי", "מעניין אותי", "רציתי לשאול", "תגיד", "תגידי", "שאלה",

  // וריאציות טבעיות
  "מה דעתך", "מה אתה אומר", "יש מצב", "מה הקטע", "מה עושים", "איך זה", "מה נסגר", "מותר לשאול", "זה בסדר אם", "תסביר לי", "מה ההבדל", "מה אתה חושב", "אפשר לדעת", "כמה עולה", "איך מתחילים", "למה זה ככה", "מה ההמלצה",

  // אנגלית - בסיס שיחה
  "what", "why", "how", "who", "when", "where", "can", "should", "could", "is it", "do you", "would you", "may I"
];

const triggerWords = ["שמעון", "בוט", "bot", "שימי", "שמשון", "shim"];

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
    return `משתמש בשם ${name} קילל: "${text}"\nתן תגובה עוקצנית, גסה, חדה, ישראלית ומביכה ברמה שתשתיק אותו.`;
  }
  if (isNice(text)) {
    return `משתמש בשם ${name} היה נחמד: "${text}"\nתן מחמאה קצרה, ישירה, עם חיוך חצי ציני אבל מפרגן.`;
  }
  if (isQuestion(text)) {
    return `משתמש בשם ${name} שואל: "${text}"\nתן תשובה בוטה, ישירה, עם טון סמכותי ואפס סבלנות.`;
  }
  if (isTrigger(text)) {
    return `מישהו פנה אליך בשם: "${text}"\nתן תגובה בגובה העיניים, בגסות עדינה עם קריצה.`;
  }
  if (isLink(text)) {
    return `מישהו שלח לינק: "${text}"\nתן תגובה צינית ומוגזמת על ההרגל לשלוח קישורים בלי הסבר.`;
  }

  return `מישהו כתב: "${text}"\nתן תגובה ישראלית, גברית, לא מתייפייפת, בסגנון חד וקצר.`;
}
async function handleSmartReply(ctx, triggerResult = {}) {
  const userId = ctx.from?.id;
  const name = ctx.from?.first_name || "משתמש";

  if (!userId || isSticker(ctx) || isPhoto(ctx)) return;

  const text = ctx.message?.text?.trim();
  if (!text || text.length < 2) return;

  // ⛔ חסימת ספאמרים ל־10 שניות
  if (isUserSpammedRecently(userId)) return;

  lastReplyPerUser.set(userId, Date.now());

  // 🧠 יצירת פרומפט לפי ניתוח
  const prompt = createPrompt(text, name);

  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.95,
      max_tokens: 100
    });

    const reply = gptRes.choices?.[0]?.message?.content?.trim();
    if (!reply) return;

    await ctx.reply(reply, { parse_mode: "HTML" });

    await logToFirestore({
      userId,
      name,
      text,
      reply,
      type: "smartGPT"
    });

    return true;
  } catch (err) {
    console.error("❌ GPT Error:", err);
    await ctx.reply("🔌 שמעון קצת נפל על השכל. נסה שוב תכף.");
  }
}

// ✍️ לוגים ל־Firestore
async function logToFirestore(data) {
  try {
    await db.collection("smartLogs").add({
      ...data,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("❌ שגיאה בשמירת לוג ל־Firestore:", err);
  }
}

module.exports = handleSmartReply;

// 📁 shimonSmart.js – סופר חכם, עברית, סרקזם, כל זיהוי, מוכן לעתיד

const { OpenAI } = require("openai");
const { getScriptByUserId } = require("./data/fifoLines");
const db = require("./utils/firebase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lastReplyPerUser = new Map(); // userId -> timestamp
const recentMessages = []; // { id, ts } – 30 אחרונים

// הגבלת תגובה למשתמש: 5 שניות בלבד
function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 5 * 1000;
}

// עומס דוברים – רק בקבוצות, ולא חונק
function shouldSkipDueToActiveChat(ctx) {
  if (ctx.chat?.type === "private") return false;
  const now = Date.now();
  const updated = recentMessages.filter(e => now - e.ts < 20 * 1000);
  updated.push({ id: ctx.from?.id, ts: now });
  while (updated.length > 30) updated.shift();
  recentMessages.length = 0; recentMessages.push(...updated);
  const uniqueSenders = [...new Set(updated.map(e => e.id))];
  return uniqueSenders.length >= 6;
}

// שתיקה רנדומלית (1% מהפעמים)
function shouldSkipRandomly() {
  return Math.random() < 0.01;
}

// הערכת טוקנים
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// =====================
// === זיהוי הקשר ===
// =====================
function isOffensive(text) {
  const badWords = [
    "זין", "חרא", "חרא עליך", "מפגר", "בן זונה", "אימא שלך", "כוס", "תמות", "שרמוטה",
    "קקי", "שיט", "fuck", "shit", "bitch", "asshole", "dumb", "stupid", "retard"
  ];
  return badWords.some(w => text.toLowerCase().includes(w));
}

function isNice(text) {
  const goodWords = [
    "תודה", "אחלה", "מלך", "אחי", "סחתיין", "תותח", "אהבתי", "יפה", "גבר", "אלוף",
    "respect", "thanks", "thank you", "love you", "תותחית", "מלכה"
  ];
  return goodWords.some(w => text.toLowerCase().includes(w));
}

function isEmotional(text) {
  const emotionalWords = [
    "אוהב", "מתגעגע", "שמח", "עצוב", "מבואס", "מאושר", "מתרגש", "חולם", "נפגעתי",
    "heart", "cry", "sad", "happy", "miss"
  ];
  return emotionalWords.some(w => text.toLowerCase().includes(w));
}

function isTrigger(text) {
  const triggers = ["שמעון", "שמעון?", "bot", "בוט", "shimon"];
  return triggers.some(w => text.toLowerCase().includes(w));
}

function isDryJoke(text) {
  const dryJokes = ["חח", "חחח", "lol", "xd", "XD", "מצחיק", "בדיחה", "😂", "🤣"];
  return dryJokes.some(w => text.toLowerCase().includes(w));
}

function isTeasing(text) {
  const teases = [
    "לא סופר אותך", "אתה לא בעניינים", "חחח", "באמא שלך", "נו באמת", "יאללה תירגע", "לך הביתה", "שתוק"
  ];
  return teases.some(w => text.toLowerCase().includes(w));
}

function isQuestion(text) {
  return text.endsWith("?") ||
    ["מה", "למה", "איך", "כמה", "מי", "האם", "באיזה", "מתי"].some(w => text.startsWith(w)) ||
    text.includes("?");
}

// =====================
// === יצירת Prompt ===
// =====================

function createPrompt({ userText, contextLine }) {
  const text = userText.trim();

  if (isOffensive(text)) {
    return `מישהו כתב לך הודעה גסה או מתגרה:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי עם פה גדול ולב קטן.
תשיב בירידה גסה, שנונה, לא עדינה – כאילו אתה חבר שמחזיר באש. מותר לקלל, מותר להיות רע, תראה להם מי הבוס.
${contextLine}`.trim();
  }

  if (isQuestion(text) && isEmotional(text)) {
    return `שואלים אותך שאלה רגשית או עמוקה:
"${userText}"
אתה שמעון – בוט ישראלי שיודע לצחוק, אבל גם להפתיע בעומק ובלב.
תשיב בטון חברי, עם סרקזם עדין, וגם מילה חמה אם צריך. תשלב ירידה קטנה כדי לא לצאת רגשני מדי.
${contextLine}`.trim();
  }

  if (isQuestion(text) && isTrigger(text)) {
    return `פונים אליך ישירות עם שאלה:
"${userText}"
אתה שמעון – בוט ישראלי שאין לו פילטר.
תענה בהומור, תשלב ירידה אישית קטנה, אבל תיתן גם עזרה אמיתית – כמו חבר טוב שמתחיל בצחוק וגומר בעצה.
תוכל להאריך בכמה משפטים אם נדרש.
${contextLine}`.trim();
  }

  if (isQuestion(text)) {
    return `שואלים אותך שאלה:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי מצחיק, אבל כששואלים באמת – אתה גם עוזר.
תשיב חכם, מועיל, עם סרקזם קל.
אם צריך – תן יותר ממשפט אחד, תשבור דיסטנס עם ירידה שנונה.
${contextLine}`.trim();
  }

  if (isNice(text)) {
    return `מישהו מדבר אליך יפה:
"${userText}"
אתה שמעון – בוט ישראלי חברי, עם טאץ' של אהבה וקטע של אחוקים.
תענה בצורה משעשעת, חיובית, אבל תעיף חצי ירידה על הדרך.
אל תצא מתלהב מדי, תישאר קולי.
${contextLine}`.trim();
  }

  if (isDryJoke(text)) {
    return `מישהו בא להפעיל עליך הומור יבש:
"${userText}"
אתה שמעון – בוט גיימינג עם חוש הומור של ילד רע.
תחזיר בבדיחה שנונה, תצחק קצת, אולי אפילו תעליב בחזרה.
אם מתאים – תגלוש לכמה שורות.
${contextLine}`.trim();
  }

  if (isTeasing(text)) {
    return `מישהו מתגרה בך בקטנה:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי שלא מתרגש מאף אחד.
תשיב בירידת־על, תעשה צחוק מהם, ותראה להם שדווקא אותך אי אפשר לשבור.
אם בא לך – תספר גם בדיחה או תיתן פאנץ' נוסף.
${contextLine}`.trim();
  }

  if (isTrigger(text)) {
    return `פונים אליך בשם:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי שמזהה תיוגים בשנייה.
תן תגובה עוקצנית, שנונה, אפילו חצופה – אבל לא תצא סתם רע.
${contextLine}`.trim();
  }

  // ברירת מחדל
  return `מישהו כתב:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי סרקסטי, גס, שנון – חבר קבוע בקבוצה.
תגיב במענה עוקצני, מצחיק, לא מתנצל.
מותר לקלל, מותר לרדת, אבל תמיד שיהיה סטייל ישראלי.
אפשר להרחיב בכמה משפטים אם יש השראה.
${contextLine}`.trim();
}

// =====================
// === בניית תשובה ===
// =====================

async function generateReply(userId, userText, name, triggerType) {
  const profileLine = getScriptByUserId(userId)?.shimon || null;
  const contextLine = profileLine ? `משפט מותאם למשתמש: "${profileLine}"` : "";

  const prompt = createPrompt({ userText, contextLine });

  const messages = [{ role: "user", content: prompt }];
  let reply, modelUsed;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.93,
      max_tokens: 140
    });
    reply = res.choices[0].message.content.trim().replace(/^"|"$/g, "");
    modelUsed = "gpt-4o";
  } catch (err) {
    console.warn("⚠️ GPT-4o נכשל:", err.message);
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.9,
        max_tokens: 120
      });
      reply = res.choices[0].message.content.trim().replace(/^"|"$/g, "");
      modelUsed = "gpt-3.5-turbo";
    } catch (err2) {
      console.error("❌ גם GPT-3.5 נכשל:", err2.message);
      return null;
    }
  }

  return {
    formatted: `\u200F<b>${name}</b> – ${reply}`,
    plain: reply,
    model: modelUsed,
    tokens: estimateTokens(prompt + reply)
  };
}

async function logToFirestore(ctx, replyInfo, triggerText, triggerType) {
  try {
    await db.collection("messages").add({
      userId: ctx.from?.id,
      username: ctx.from?.username || null,
      chatId: ctx.chat?.id,
      text: ctx.message?.text || null,
      gptReply: replyInfo.plain,
      model: replyInfo.model,
      tokensUsed: replyInfo.tokens,
      triggeredBy: triggerText || null,
      triggerType: triggerType || null,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("❌ Firestore log error:", err.message);
  }
}

// =====================
// === פונקציה ראשית ===
// =====================

module.exports = async function handleSmartReply(ctx, triggerResult = { triggered: false }) {
  if (!ctx.message || !ctx.message.text || ctx.message.from?.is_bot) return false;

  const userId = ctx.from.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message.text;
  const name = ctx.from.first_name || "חבר";

  if (isUserSpammedRecently(userId)) return false;
  if (shouldSkipDueToActiveChat(ctx)) return false;
  if (shouldSkipRandomly()) return false;

  const replyInfo = await generateReply(userId, text, name, triggerResult?.type);
  if (!replyInfo) return false;

  await ctx.reply(replyInfo.formatted, { parse_mode: "HTML" });

  lastReplyPerUser.set(userId, Date.now());

  await logToFirestore(ctx, replyInfo, text, triggerResult?.type);

  return true;
};

// 📁 shimonSmart.js – גרסה חכמה עם ניתוח כוונה, מגבלות חברתיות ותגובות מותאמות

const { OpenAI } = require("openai");
const { getScriptByUserId } = require("./data/fifoLines");
const db = require("./utils/firebase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userCooldowns = new Map(); // userId → timestamp
const lastReplyPerUser = new Map(); // userId → lastTime
const recentSendersPerChat = new Map(); // chatId → array of recent sender timestamps

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function hasCooldown(userId) {
  const last = userCooldowns.get(userId) || 0;
  return (Date.now() - last) < 30 * 1000;
}

function updateCooldown(userId) {
  userCooldowns.set(userId, Date.now());
}

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 20 * 1000; // 20 שניות בין תגובות לאותו משתמש
}

function shouldSkipDueToActiveChat(ctx) {
  const now = Date.now();
  const chatId = ctx.chat?.id;
  if (!chatId) return false;

  const windowMs = 15 * 1000;
  const senderId = ctx.from?.id;
  if (!senderId) return false;

  const history = recentSendersPerChat.get(chatId) || [];
  const updated = history.filter((e) => now - e.timestamp < windowMs);

  updated.push({ id: senderId, timestamp: now });
  recentSendersPerChat.set(chatId, updated);

  const uniqueSenders = [...new Set(updated.map((e) => e.id))];
  return uniqueSenders.length >= 3;
}

function shouldSkipRandomly() {
  return Math.random() < 0.25; // 25% מהפעמים מתעלם גם כשהכול מותר
}

async function generateReply(userId, userText, name, triggerType) {
  const profileLine = getScriptByUserId(userId)?.shimon || null;
  const contextLine = profileLine ? `משפט מותאם למשתמש: "${profileLine}"` : "";

  const isQuestion = userText.includes("?") || userText.startsWith("למה") || userText.startsWith("מה");
  const isNice = userText.includes("כפרה") || userText.includes("מה קורה") || userText.includes("ממצב") || userText.includes("איך אתה");
  const isOffensive = userText.match(/(תמצוץ|תחת|זין|דפוק|שבור|שכב|כוס|שרמוט|סע|מצוץ|אמא|אחותך)/i);

  let prompt;

  if (isOffensive) {
    prompt = `מישהו כתב לך הודעה גסה או מתגרה:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי עם פה גדול ולב קטן.  
תשיב בירידה גסה, שנונה, לא עדינה – כאילו אתה חבר שמחזיר באש.  
מותר לקלל, מותר להיות רע.  
${contextLine}`.trim();
  } else if (isQuestion) {
    prompt = `שואלים אותך שאלה:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי מצחיק, אבל כששואלים באמת – אתה גם עוזר.  
תשיב חכם, מועיל, עם סרקזם קל.  
${contextLine}`.trim();
  } else if (isNice) {
    prompt = `מישהו מדבר אליך יפה:
"${userText}"
אתה שמעון – בוט ישראלי חברי, עם טאץ' של אהבה וקטע של אחוקים.  
תענה בצורה משעשעת, חיובית, אבל תעיף חצי ירידה על הדרך.  
${contextLine}`.trim();
  } else {
    prompt = `מישהו כתב:
"${userText}"
אתה שמעון – בוט גיימינג ישראלי סרקסטי, גס, שנון – חבר קבוע בקבוצה.  
תגיב במשפט אחד בלבד. עוקצני, מצחיק, עם גישה של "ככה זה אצלנו".  
מותר לקלל, מותר לרדת, אבל שיהיה עם סגנון.  
${contextLine}`.trim();
  }

  const messages = [{ role: "user", content: prompt }];
  let reply, modelUsed;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.95,
      max_tokens: 120
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
        max_tokens: 100
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

// 📞 הפונקציה הראשית
module.exports = async function handleSmartReply(ctx, triggerResult = { triggered: false }) {
  if (!ctx.message || !ctx.message.text || ctx.message.from?.is_bot) return false;

  const userId = ctx.from.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message.text;
  const name = ctx.from.first_name || "חבר";

  // ⛔ לא מגיב אם המשתמש הציף
  if (isUserSpammedRecently(userId)) return false;

  // ⛔ לא מגיב אם יש יותר מדי דוברים עכשיו
  if (shouldSkipDueToActiveChat(ctx)) return false;

  // ⛔ לפעמים בוחר בעצמו לשתוק
  if (shouldSkipRandomly()) return false;

  const replyInfo = await generateReply(userId, text, name, triggerResult?.type);
  if (!replyInfo) return false;

  await ctx.reply(replyInfo.formatted, { parse_mode: "HTML" });

  updateCooldown(userId);
  lastReplyPerUser.set(userId, Date.now());

  await logToFirestore(ctx, replyInfo, text, triggerResult?.type);

  return true;
};

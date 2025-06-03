// 📁 shimonSmart.js – גרסה חדה, גברית, קצרה ועוקצנית

const { OpenAI } = require("openai");
const { getScriptByUserId } = require("./data/fifoLines");
const db = require("./utils/firebase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lastReplyPerUser = new Map();

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 5 * 1000;
}

function isOffensive(text) {
  const badWords = ["זין", "חרא", "מפגר", "בן זונה", "כוס", "fuck", "shit", "bitch"];
  return badWords.some(w => text.toLowerCase().includes(w));
}

function isTrigger(text) {
  const triggers = ["שמעון", "bot", "בוט", "shim"];
  return triggers.some(w => text.toLowerCase().includes(w));
}

function isNice(text) {
  const goodWords = ["תודה", "מלך", "גבר", "respect"];
  return goodWords.some(w => text.toLowerCase().includes(w));
}

function isQuestion(text) {
  return text.endsWith("?") || ["מה", "למה", "איך"].some(w => text.startsWith(w));
}

function createPrompt({ userText }) {
  const text = userText.trim();

  if (isOffensive(text)) {
    return `מישהו קילל: "${text}"\nשמעון – תן ירידה גסה, קצרה, בלי דיבור יפה.`;
  }
  if (isTrigger(text)) {
    return `קוראים לך שמעון: "${text}"\nתן תשובה גברית, חדה, קצרה וסרקסטית.`;
  }
  if (isNice(text)) {
    return `משהו נחמד: "${text}"\nתן מחמאה קצרת רוח בסגנון ישראלי.`;
  }
  if (isQuestion(text)) {
    return `שואלים אותך: "${text}"\nתן תשובה בגסות, תשובה אחת בלי חפירות.`;
  }
  return `מישהו כתב: "${text}"\nתגיב קצר, עוקצני, גברי, בלי דיבורי סרק.`;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function generateReply(userId, userText, name) {
  const prompt = createPrompt({ userText });
  console.log("📤 Prompt:", prompt);

  const messages = [{ role: "user", content: prompt }];
  let reply, modelUsed;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 1.11,
      max_tokens: 55
    });
    reply = res.choices[0]?.message?.content?.trim()?.replace(/^"|"$/g, "") || null;
    modelUsed = "gpt-4o";
  } catch (err) {
    console.warn("⚠️ GPT-4o נכשל:", err.message);
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 1.07,
        max_tokens: 50
      });
      reply = res.choices[0]?.message?.content?.trim()?.replace(/^"|"$/g, "") || null;
      modelUsed = "gpt-3.5-turbo";
    } catch (err2) {
      console.error("❌ גם GPT-3.5 נכשל:", err2.message);
      reply = "יאללה, לך תביא כוס מים ותחזור אליי כמו גבר.";
      modelUsed = "fallback";
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

module.exports = async function handleSmartReply(ctx, triggerResult = { triggered: false }) {
  if (!ctx.message || !ctx.message.text || ctx.message.from?.is_bot) return false;

  const userId = ctx.from.id;
  const text = ctx.message.text;
  const name = ctx.from.first_name || "חבר";

  // אם תרצה להפעיל אנטי־ספאם, תבטל את ההערה הבאה:
  // if (isUserSpammedRecently(userId)) return false;

  const replyInfo = await generateReply(userId, text, name);
  if (!replyInfo) {
    console.warn("❌ לא נוצרה תשובה – replyInfo ריק.");
    return false;
  }

  try {
    await ctx.reply(replyInfo.formatted, { parse_mode: "HTML" });
    lastReplyPerUser.set(userId, Date.now());
    await logToFirestore(ctx, replyInfo, text, triggerResult?.type);
    console.log(`🟢 תשובה נשלחה (${replyInfo.model})`);
    return true;
  } catch (err) {
    console.error("❌ שגיאה בשליחת תגובה:", err.message);
    return false;
  }
};

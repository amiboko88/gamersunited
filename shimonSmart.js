// 📁 shimonSmart.js – תגובה חכמה בטלגרם עם GPT, Firestore ו־FIFO

const { Configuration, OpenAIApi } = require("openai");
const { getScriptByUserId } = require("./data/fifoLines");
const db = require("./utils/firebase");

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

const userCooldowns = new Map(); // userId -> timestamp


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

async function generateReply(userId, text) {
  const profileLine = getScriptByUserId(userId)?.shimon || null;
  const contextLine = profileLine ? `משפט מותאם למשתמש: "${profileLine}"` : "";

  const prompt = `אתה שמעון, בוט גיימינג ישראלי סרקסטי ומצחיק.
${contextLine}
מישהו כתב: "${text}"
תגיב בעברית. קצר, עוקצני, שנון, לא רובוטי.`

  const messages = [{ role: "user", content: prompt }];
  let reply = null;
  let modelUsed = null;

  try {
    const res = await openai.createChatCompletion({
      model: "gpt-4o",
      messages,
      temperature: 0.9,
      max_tokens: 100
    });
    reply = res.data.choices[0].message.content;
    modelUsed = "gpt-4o";
  } catch (err) {
    console.warn("⚠️ GPT-4o נכשל:", err.message);
    try {
      const res = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.9,
        max_tokens: 100
      });
      reply = res.data.choices[0].message.content;
      modelUsed = "gpt-3.5-turbo";
    } catch (err2) {
      console.error("❌ גם GPT-3.5 נכשל:", err2.message);
      return null;
    }
  }

  return {
   formatted: `\u200F<b>${ctx.from?.first_name || 'חבר'}</b> – ${reply}`,

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

// 📞 פונקציה ראשית (export)
module.exports = async function handleSmartReply(ctx, triggerResult = { triggered: false }) {
  if (!ctx.message || !ctx.message.text || ctx.message.from?.is_bot) return false;

  const userId = ctx.from?.id;
  const text = ctx.message.text;

  // הגבלת תזמון לפי משתמש
  if (hasCooldown(userId)) return false;

  const replyInfo = await generateReply(userId, text);
  if (!replyInfo) return false;

  await ctx.reply(replyInfo.formatted, { parse_mode: "HTML" });
  updateCooldown(userId);

  await logToFirestore(ctx, replyInfo, text, triggerResult?.type);

  return true;
};

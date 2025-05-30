// 📁 shimonSmart.js – הגנה, fallback אלגנטי ודילוג על Slash

const { OpenAI } = require("openai");
const { getScriptByUserId } = require("./data/fifoLines");
const db = require("./utils/firebase");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lastReplyPerUser = new Map();
const recentMessages = [];

function isUserSpammedRecently(userId) {
  const last = lastReplyPerUser.get(userId) || 0;
  return (Date.now() - last) < 5 * 1000;
}

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

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
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

function cleanFallbackPrefix(text) {
  return text.replace(/fallback\s?#?\d+\s?[-–]\s?/i, "").trim();
}

function createPrompt({ userText, contextLine }) {
  const text = userText.trim();
  if (isOffensive(text)) {
    return `משתמש קילל: "${text}"\nשמעון – תגיב בירידה חריפה וסרקסטית. ${contextLine}`;
  }
  if (isTrigger(text)) {
    return `מישהו קרא לשמעון: "${text}"\nתן תגובה חדה, מצחיקה ומעט חצופה. ${contextLine}`;
  }
  if (isNice(text)) {
    return `משתמש מחמיא: "${text}"\nשמעון – תחמיא בחזרה, אבל עם טוויסט ציני. ${contextLine}`;
  }
  if (isQuestion(text)) {
    return `שאלה נשאלה: "${text}"\nשמעון – ענה תשובה עם הומור, עוקצנות וטיפה עומק. ${contextLine}`;
  }
  return `הודעה התקבלה: "${text}"\nשמעון – תגיב בסרקזם ישראלי, כולל ירידה מצחיקה. ${contextLine}`;
}

async function generateReply(userId, userText, name, triggerType) {
  const profileRaw = getScriptByUserId(userId)?.shimon || null;
  const profileLine = profileRaw ? cleanFallbackPrefix(profileRaw) : null;
  const contextLine = profileLine ? `משפט אישי: "${profileLine}"` : "";

  const prompt = createPrompt({ userText, contextLine });
  console.log("📤 Prompt:", prompt);

  const messages = [{ role: "user", content: prompt }];
  let reply, modelUsed;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.93,
      max_tokens: 140
    });
    reply = res.choices[0]?.message?.content?.trim()?.replace(/^"|"$/g, "") || null;
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
      reply = res.choices[0]?.message?.content?.trim()?.replace(/^"|"$/g, "") || null;
      modelUsed = "gpt-3.5-turbo";
    } catch (err2) {
      console.error("❌ גם GPT-3.5 נכשל:", err2.message);
      reply = "אני כרגע על הפנים. תנסה שוב עוד רגע – או תדבר יפה יותר 😴";
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
  try {
    if (!ctx.message || !ctx.message.text || ctx.message.from?.is_bot) return false;

    //  דילוג על פקודות Slash (כמו /start, /help)
  if  (ctx.message.text?.startsWith("/")) {
  console.log(" זוהתה פקודת Slash – בוט חכם מתעלם");
  return false;
}

    const userId = ctx.from.id;
    const text = ctx.message.text;
    const name = ctx.from.first_name || "חבר";

    // 🛠️ לבדיקות: הסר חסימות זמנית
    // if (isUserSpammedRecently(userId)) return false;
    // if (shouldSkipDueToActiveChat(ctx)) return false;

    const replyInfo = await generateReply(userId, text, name, triggerResult?.type);
    if (!replyInfo) {
      console.warn("❌ לא נוצרה תשובה – replyInfo ריק.");
      return false;
    }

    await ctx.reply(replyInfo.formatted, { parse_mode: "HTML" });
    lastReplyPerUser.set(userId, Date.now());
    await logToFirestore(ctx, replyInfo, text, triggerResult?.type);

    console.log(`🟢 תשובה נשלחה (${replyInfo.model})`);
    return true;

  } catch (err) {
    console.error("❌ שגיאה חיצונית ב־handleSmartReply:", err.message);
    try {
      await ctx.reply("❌ שמעון הסתבך עם התגובה. נסה שוב.");
    } catch {}
    return false;
  }
};

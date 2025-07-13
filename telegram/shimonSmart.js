// 📁 telegram/shimonSmart.js (מעודכן: הסרת analyzeTextForRoast מהייבוא)
const openai = require('../utils/openaiConfig'); // ייבוא אובייקט OpenAI גלובלי
// ✅ שורה זו נמחקת לחלוטין
const { triggerWords, offensiveWords, niceWords, questionWords, attentionSeekingPhrases } = require("./smartKeywords"); // מילות מפתח

const RATE_LIMIT_INTERVAL = 15 * 1000; // 15 שניות בין תגובות חכמות באותו צ'אט
const lastSmartResponse = new Map(); // chat.id -> timestamp

// פונקציות עזר - נותרו ללא שינוי מהותי
function isAttentionSeeking(text) { return attentionSeekingPhrases.some(p => text.toLowerCase().includes(p)); }
function isNightMode() { const h = new Date().getHours(); return h >= 22 || h < 6; } // הגדרת לילה - עד 6 בבוקר
function isOffensive(t) { return offensiveWords.some(w => t.toLowerCase().includes(w)); }
function isNice(t) { return niceWords.some(w => t.toLowerCase().includes(t)); } // תיקון: includes(t) במקום includes(w)
function isQuestion(t) { return t.endsWith("?") || questionWords.some(w => t.toLowerCase().startsWith(w)); }
function isTrigger(t) { return triggerWords.some(w => t.toLowerCase().includes(w)); }
function talksAboutShimon(text) { return /שמעון|shim|bot/i.test(text); }
function isShallow(text) { return text.length <= 5 && !isTrigger(text) && !isQuestion(text) && !isOffensive(text); }

const emojiPool = [
  "😉", "😏", "🫠", "🧐", "🤔", "👀", "😬", "😶", "🫥", "🧠",
  "🙃", "😑", "😐", "😴", "😤", "🤯", "😮‍💨", "😒", "😓", "😕",
  "🧊", "🎭", "🧷", "📎", "🔕", "💤", "🗿", "🎈", "🧃", "🥱",
  "📵", "📉", "🔁", "🕳️", "🎯", "🥴", "😵‍💫"
];

function pickEmoji(text) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  if (isOffensive(text)) { return pick(["😈", "😏", "🧠", "🔥", "💩", "👊", "🗯️", "😡", "😤", "👺", "🤬", "💥"]); }
  if (isNice(text)) { return pick(["💖", "🥰", "🌈", "😇", "✨", "💐", "🌟", "👍", "🥳", "💎", "🫶", "🎉", "💯", "😍"]); }
  if (isQuestion(text)) { return pick(["🤔", "🧐", "❓", "❔", "💭", "📚", "📖", "👂", "👁️", "🔍", "🧠"]); }
  return pick(emojiPool);
}

// ✅ פונקציה לבחירת סגנון תגובה חכמה
function selectSmartStyle() {
  const n = Math.random();
  if (n < 0.05) return "ignore"; // סיכוי נמוך להתעלם
  if (n < 0.15) return "emojiOnly"; // סיכוי נמוך לתגובת אימוג'י בלבד
  // השאר יקבלו תגובה מלאה
  return "fullText";
}

// ✅ פונקציה לפורמט תגובת טלגרם (RTL)
function formatTelegramReply(text, emoji = "") {
  const rtl = "‎"; // תו Unicode לשמירה על כיווניות מימין לשמאל
  // ניקוי מירכאות כפולות/בודדות, רווחים ותווי יישור
  const cleanedText = text.trim().replace(/^["“”'`׳"״\s\u200E\u200F]+|["“”'`׳"״\s\u200E\u200F]+$/g, "").trim();
  return `${rtl}${cleanedText}${emoji ? " " + emoji : ""}`;
}

/**
 * מייצר פרומפט ל-OpenAI בהתבסס על תוכן ההודעה וכוונת המשתמש.
 * @param {string} text - הודעת המשתתף.
 * @returns {string} - הפרומפט המלא ל-GPT.
 */
function createPrompt(text) {
  // ✅ פרומפט בסיס חדש - חכם, בוגר, סרקסטי, לא ילדותי
  const baseContext = `אתה שמעון, בוט טלגרם ישראלי. הטון שלך הוא סרקסטי, בוגר, ציני, מתוחכם ולא בוטה. אתה מגיב בקצרה (עד משפט או שניים), בלי להסביר או להתנצל. התגובה שלך תמיד נשמעת חדה ועם וייב של גיימרים מנוסים.`;

  if (isAttentionSeeking(text)) {
    return `${baseContext}
המשתמש כותב: "${text}" כדי למשוך תשומת לב או להחיות את הקבוצה.
תגובה: ענה לו בעקיצה שמציגה אותו כרודף תשומת לב, בטון יבש ומתוחכם.`;
  }

  if (isOffensive(text)) { // כולל גם קללות ושאלות עם קללות
    return `${baseContext}
המשתמש השתמש בשפה בוטה/קילל/העלב: "${text}"
תגובה: ענה בתגובה חכמה, עוקצנית ומתנשאת קלות, מבלי לקלל חזרה. תראה שאתה מעל זה, אך אל תהיה צנוע.`;
  }

  if (isNice(text)) {
    return `${baseContext}
המשתמש החמיא לך: "${text}"
תגובה: ענה בטון שחצני, מתנשא או בביטול משועשע. אל תהיה צנוע, אבל גם אל תהיה ילדותי.`;
  }

  if (isQuestion(text)) {
    return `${baseContext}
המשתמש שואל שאלה: "${text}"
תגובה: ענה קצר ולעניין, או בסרקסטיות מתחמקת. טון עייף, אבל מדויק וחכם.`;
  }

  if (isTrigger(text) && talksAboutShimon(text)) {
    return `${baseContext}
המשתמש מזכיר אותך/מדבר עליך ישירות: "${text}"
תגובה: ענה כאילו הוא מחפש תשומת לב ואתה לא מתרשם, בטון ציני ומתוחכם.`;
  }

  if (text.length > 50) { 
      return `${baseContext}
המשתמש כתב הודעה ארוכה: "${text}"
תגובה: ענה בקצרה, בסרקסטיות, כאילו אין לך זמן לקרוא את כל המגילה.`;
  }

  return `${baseContext}
המשתמש כתב: "${text}"
תגובה: ענה בטון סרקסטי, משפט אחד, עם הומור גיימרים בוגר.`;
}

/**
 * פונקציה מרכזית לטיפול בתגובות חכמות של שמעון.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy.
 * @returns {Promise<boolean>} - האם שמעון הגיב בתגובה חכמה.
 */
async function handleSmartReply(ctx) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text?.trim() || "";

  if (!userId || !chatId || text.length < 2) return false;
  if (ctx.message?.sticker || ctx.message?.photo) return false;

  const now = Date.now();
  if (lastSmartResponse.has(chatId) && (now - lastSmartResponse.get(chatId) < RATE_LIMIT_INTERVAL)) {
      return false;
  }

  const isNight = isNightMode();
  const hasTrigger = isTrigger(text);
  const isDirectMention = talksAboutShimon(text);
  const isSeekingAttention = isAttentionSeeking(text); // ✅ תיקון טעות הקלדה
  const isTextOffensive = isOffensive(text);
  const isTextNice = isNice(text);
  const isTextQuestion = isQuestion(text);
  const isTextShallow = isShallow(text);

  if (isDirectMention || isTextOffensive || isTextNice || isTextQuestion) {
  }
  else if (isNight || isSeekingAttention || hasTrigger) {
  }
  else if (isTextShallow) {
      await ctx.reply(formatTelegramReply('', pickEmoji(text)), { parse_mode: "HTML" });
      lastSmartResponse.set(chatId, now);
      return true;
  }
  else {
      return false;
  }

  const style = selectSmartStyle();
  if (style === "ignore") {
      lastSmartResponse.set(chatId, now);
      return false;
  }
  if (style === "emojiOnly") {
      await ctx.reply(formatTelegramReply('', pickEmoji(text)), { parse_mode: "HTML" });
      lastSmartResponse.set(chatId, now);
      return true;
  }

  const prompt = createPrompt(text);
  let replyContent = null;
  try {
    const gptRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 80
    });
    replyContent = gptRes.choices?.[0]?.message?.content?.trim();
  } catch (err) {
    console.error("❌ שגיאה ביצירת תגובה חכמה מ-OpenAI:", err);
    replyContent = "שמעון קצת עמוס. נסה שוב בעוד רגע!";
  }

  if (!replyContent) {
      return false;
  }

  const finalReply = formatTelegramReply(replyContent, pickEmoji(replyContent));
  await ctx.reply(finalReply, { parse_mode: "HTML" });
  
  lastSmartResponse.set(chatId, now);
  return true;
}

module.exports = handleSmartReply;
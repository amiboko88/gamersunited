// 📁 telegram/roastTelegram.js (מעודכן: שימוש ב-OpenAI גלובלי ושיפורים)
const openai = require("../utils/openaiConfig"); // ✅ ייבוא אובייקט OpenAI גלובלי
const PEOPLE = require("./roastProfiles"); // פרופילי משתמשים

const emojiPool = ["😉", "🔥", "😏", "😬", "🥴", "👀", "🎯", "🤭"];

function randomEmoji() {
  return emojiPool[Math.floor(Math.random() * emojiPool.length)];
}

/**
 * מוצא התאמה של שם משתמש בטקסט מול פרופילי הצלייה.
 * @param {string} text - הטקסט לסריקה.
 * @returns {object|null} - אובייקט של האדם התואם או null.
 */
function findMatchInText(text) {
  return PEOPLE.find(person =>
    person.aliases.some(alias => text.toLowerCase().includes(alias.toLowerCase()))
  );
}

/**
 * מעצב תגובת צלייה לפורמט HTML עם יישור RTL.
 * @param {string} name - השם של האדם.
 * @param {string} text - טקסט הצלייה.
 * @param {string} emoji - אימוג'י להוספה.
 * @returns {string} - תגובת HTML מעוצבת.
 */
function formatRoastReply(name, text, emoji = "😉") {
  const rtl = "\u200F"; // יישור עברית תקני

  const cleaned = text
    .trim()
    .replace(/^["“”'`׳"״\s\u200E\u200F]+|["“”'`׳"״\s\u200E\u200F]+$/g, "") // הסרת מירכאות ורווחים בהתחלה ובסוף
    .replace(/[\u200E\u200F]+/g, "") // הסרת תווי יישור פנימיים
    .replace(/^ש(מעון|משון|ימי)[,:\-]?\s*/i, "") // הסרת פתיחים פונים לשמעון
    .trim();

  return `${rtl}<b>${name}, ${cleaned} ${emoji}</b>`; // ✅ הדגשה ואימוג'י
}

/**
 * מייצר טקסט צלייה באמצעות GPT.
 * @param {string} name - שם האדם.
 * @param {string[]} traits - מאפיינים אישיים.
 * @param {string} description - תיאור רקע.
 * @returns {Promise<string>} - טקסט הצלייה מ-GPT.
 */
async function generateRoastViaGPT(name, traits, description) {
  const traitsText = traits?.length ? traits.join(", ") : "אין הרבה מידע, אבל תזרום.";
  const extra = description ? `\nתיאור רקע: ${description}` : "";

  const prompt = `
אתה בוט עוקצני בשם שמעון.
כתוב תגובה אחת בלבד, קצרה (עד משפט אחד), עוקצנית, חדה, ומצחיקה כלפי אדם בשם "${name}".
המאפיינים שלו: ${traitsText}.${extra}
אל תשתמש בשם שלך. אל תדבר אליו ישירות. אל תסביר. אל תתנצל.
פשוט שחרר עקיצה שנשמעת כאילו מישהו הקפיץ שורה בצ'אט קבוצתי.
אם אין הרבה מידע, המצא סטירה מקורית.
`.trim(); // ✅ הסרת רווחים מיותרים בפרומפט

  try {
    const response = await openai.chat.completions.create({ // ✅ שימוש באובייקט openai המיובא
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.95, // יצירתיות גבוהה יותר לרואסטים
      max_tokens: 50
    });

    return response.choices?.[0]?.message?.content?.trim() || "GPT החליט לא להגיב. מוזר.";
  } catch (err) {
    console.error("🔥 שגיאה ב־GPT Roast:", err);
    return "הייתי יורד עליו, אבל גם GPT סירב.";
  }
}

const usedRoastCallbacks = new Set(); // עוקב אחרי קריאות חוזרות של כפתורי Roast

/**
 * מנתח טקסט עבור התאמות ל-Roast ומבצע את ה-Roast אם נמצאה התאמה.
 * @param {string} text - הטקסט לניתוח.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy (נדרש לשליחת תגובה).
 * @returns {Promise<boolean>} - האם בוצע Roast.
 */
async function analyzeTextForRoast(text, ctx) { // ✅ ctx הוא כעת פרמטר חובה
  const match = findMatchInText(text);
  if (!match || !ctx) return false;

  const roast = await generateRoastViaGPT(match.name, match.traits, match.description);
  const formatted = formatRoastReply(match.name, roast, randomEmoji());

  const msg = await ctx.reply(formatted, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "🎯 עוד אחד", callback_data: `roast_again_${ctx.from.id}` }]]
    }
  });

  usedRoastCallbacks.add(`roast_again_${ctx.from.id}_${msg.message_id}`); // שמירת מזהה ייחודי ל-callback

  return true; // ✅ בוצע Roast
}

/**
 * רושם את כפתורי ה-Roast לבוט הטלגרם.
 * @param {import('grammy').Bot} bot - אובייקט הבוט של grammy.
 */
function registerRoastButtons(bot) {
  bot.callbackQuery(/^roast_again_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const callbackUser = Number(ctx.match[1]);
    const messageId = ctx.callbackQuery?.message?.message_id;

    if (userId !== callbackUser) {
      return ctx.answerCallbackQuery({ text: "זה לא הכפתור שלך 🤨", show_alert: true });
    }

    const uniqueKey = `roast_again_${userId}_${messageId}`;
    if (usedRoastCallbacks.has(uniqueKey)) {
      return ctx.answerCallbackQuery({ text: "כבר השתמשת בכפתור הזה!", show_alert: true });
    }

    usedRoastCallbacks.add(uniqueKey);
    await ctx.answerCallbackQuery(); // תשובה מיידית ל-callback query

    await ctx.deleteMessage().catch(() => {}); // מחיקת הודעה קודמת

    const originalText = ctx.callbackQuery?.message?.reply_to_message?.text || "";
    const match = findMatchInText(originalText);
    if (!match) return;

    const newRoast = await generateRoastViaGPT(match.name, match.traits, match.description);
    const formatted = formatRoastReply(match.name, newRoast, randomEmoji());

    await ctx.reply(formatted, { parse_mode: "HTML" });
  });
}

module.exports = {
  analyzeTextForRoast,
  registerRoastButtons,
  findMatchInText // מיוצא גם לשימוש ב-shimonSmart.js
};
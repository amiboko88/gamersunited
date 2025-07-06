const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEOPLE = require("./roastProfiles");

const emojiPool = ["😉", "🔥", "😏", "😬", "🥴", "👀", "🎯", "🤭"];

function randomEmoji() {
  return emojiPool[Math.floor(Math.random() * emojiPool.length)];
}

function findMatchInText(text) {
  return PEOPLE.find(person =>
    person.aliases.some(alias => text.toLowerCase().includes(alias.toLowerCase()))
  );
}

function formatRoastReply(name, text, emoji = "😉") {
  const rtl = "\u200F"; // יישור עברית תקני

  const cleaned = text
    .trim()
    .replace(/^["“”'`׳"״\s\u200E\u200F]+|["“”'`׳"״\s\u200E\u200F]+$/g, "")
    .replace(/[\u200E\u200F]+/g, "")
    .replace(/^ש(מעון|משון|ימי)[,:\-]?\s*/i, "")
    .trim();

  return `${rtl}<b>${name}, ${cleaned} ${emoji}</b>`;
}

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
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.95,
      max_tokens: 50
    });

    return response.choices?.[0]?.message?.content?.trim() || "GPT החליט לא להגיב. מוזר.";
  } catch (err) {
    console.error("🔥 שגיאה ב־GPT Roast:", err);
    return "הייתי יורד עליו, אבל גם GPT סירב.";
  }
}

const usedRoastCallbacks = new Set();

async function analyzeTextForRoast(text, ctx = null) {
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

  usedRoastCallbacks.add(`roast_again_${ctx.from.id}_${msg.message_id}`);

  return true; // ✅ החלק החשוב
}


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
    await ctx.answerCallbackQuery();

    // מחיקת הודעה קודמת
    await ctx.deleteMessage().catch(() => {});

    // שיחזור טקסט מקורי
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
  findMatchInText
};


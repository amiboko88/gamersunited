const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { analyzeTextForRoast } = require("./roastTelegram");
const {
  triggerWords,
  offensiveWords,
  niceWords,
  questionWords,
  attentionSeekingPhrases
} = require("./smartKeywords");

function isAttentionSeeking(text) {
  return attentionSeekingPhrases.some(p => text.toLowerCase().includes(p));
}

function isNightMode() {
  const h = new Date().getHours();
  return h >= 22 && h < 24;
}
function isOffensive(t) {
  return offensiveWords.some(w => t.toLowerCase().includes(w));
}
function isNice(t) {
  return niceWords.some(w => t.toLowerCase().includes(w));
}
function isQuestion(t) {
  return t.endsWith("?") || questionWords.some(w => t.toLowerCase().startsWith(w));
}
function isTrigger(t) {
  return triggerWords.some(w => t.toLowerCase().includes(w));
}
function talksAboutShimon(text) {
  return /שמעון.*(הוא|אמר|זה|חושב|מתנהג|עושה|כתב)/i.test(text);
}
function isShallow(text) {
  return text.length <= 5 && !isTrigger(text) && !isQuestion(text) && !isOffensive(text);
}

const emojiPool = [
  "😉", "😏", "🫠", "🧐", "🤔", "👀", "😬", "😶", "🫥", "🧠",
  "🙃", "😑", "😐", "😴", "😤", "🤯", "😮‍💨", "😒", "😓", "😕",
  "🧊", "🎭", "🧷", "📎", "🔕", "💤", "🗿", "🎈", "🧃", "🥱",
  "📵", "📉", "🔁", "🕳️", "🎯", "🥴", "😵‍💫"
];

function pickEmoji(text) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  if (isOffensive(text)) {
    return pick([
      "😈", "😏", "🧠", "🔥", "💩", "👊", "🗯️", "😡", "🖕", "💣",
      "😤", "👺", "🤬", "🪓", "🥊", "🚬", "💥", "🖍️", "🎃", "🧨"
    ]);
  }

  if (isNice(text)) {
    return pick([
      "💖", "🥰", "🌈", "😇", "✨", "💐", "🌟", "👍", "🥳", "💎",
      "🫶", "🎉", "💯", "😍", "🎀", "💌", "🌷", "☀️", "🦄", "🌻"
    ]);
  }

  if (isQuestion(text)) {
    return pick([
      "🤔", "🧐", "❓", "❔", "💭", "📚", "📖", "👂", "👁️", "🔍",
      "🧭", "📅", "⏳", "🧪", "💡", "🗒️", "🧠", "🧮", "🔎", "🧱"
    ]);
  }

  return pick(emojiPool);
}

function randomStyle() {
  const n = Math.random();
  if (n < 0.05) return "ignore";
  if (n < 0.15) return "rejection";
  if (n < 0.30) return "emojiOnly";
  return "fullText";
}

function formatReply(text, emoji = "") {
  const rtl = "‏";
  return `${rtl}${text.trim().replace(/["“”'`׳"״]/g, "")}${emoji ? " " + emoji : ""}`;
}

function createPrompt(text) {
  const context = `אתה בוט בשם שמעון. אתה עוקצני, ישראלי, לא סובל שטויות.
אתה מגיב בצ׳אט קבוצתי. תגיב בקצרה, בלי להסביר ובלי לפנות בשמות. 
התגובה שלך תמיד נשמעת כאילו כתבת אותה תוך כדי לעיסת בורקס – חצי קשב, חצי עצבים.`;

  if (isAttentionSeeking(text)) {
    return `${context}
מישהו כותב "${text}" כדי למשוך תשומת לב או להחיות את הקבוצה.
ענה לו בעקיצה כאילו תפסת אותו מחפש תשומת לב, בטון יבש וציני.`;
  }

  if (isOffensive(text) && isQuestion(text)) {
    return `${context}
הודעה עם גם קללה וגם שאלה: "${text}"
ענה בעקיצה סרקסטית אחת.`;
  }

  if (isOffensive(text)) {
    return `${context}
מישהו שלח קללה או העלבה: "${text}"
ענה בקללה חכמה ועוקצנית, בלי להתרגש.`;
  }

  if (isNice(text)) {
    return `${context}
מישהו מחמיא לך: "${text}"
ענה בטון אדיש, כאילו מחמיאים לך כל הזמן.`;
  }

  if (isQuestion(text)) {
    return `${context}
מישהו שואל שאלה: "${text}"
ענה קצר ולעניין, טון עייף אבל מדויק.`;
  }

  if (isTrigger(text)) {
    return `${context}
מישהו פשוט מזכיר את השם שלך או קורא לך: "${text}"
ענה כאילו הוא מחפש תשומת לב ואתה לא ממש מתרשם.`;
  }

  return `${context}
מישהו כתב סתם הודעה: "${text}"
ענה בטון סרקסטי, משפט אחד.`;
}

async function shimonSmart(ctx) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text?.trim() || "";
  if (!userId || !chatId || text.length < 2) return false;
  if (ctx.message?.sticker || ctx.message?.photo) return false;

  const nowNight = isNightMode();
  const trigger = isTrigger(text);
  const indirect = talksAboutShimon(text);
  const attention = isAttentionSeeking(text);

  if (!nowNight && !trigger && !attention) return false;
  if (!nowNight && indirect) return true;

  const roasted = await analyzeTextForRoast(text, ctx);
  if (roasted) return true;

  if (isShallow(text)) {
    const emoji = pickEmoji(text);
    await ctx.reply(`‏${emoji}`, { parse_mode: "HTML" });
    return true;
  }

  const style = randomStyle();
  if (style === "ignore") return false;
  if (style === "rejection") {
    await ctx.reply(`‏למה נראה לך שמגיע לך תגובה 🫥`, { parse_mode: "HTML" });
    return true;
  }
  if (style === "emojiOnly") {
    await ctx.reply(`‏${pickEmoji(text)}`, { parse_mode: "HTML" });
    return true;
  }

  const prompt = createPrompt(text);
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 100
    });

    const raw = gptRes.choices?.[0]?.message?.content?.trim();
    if (!raw) return false;

    const emoji = pickEmoji(text);
    const reply = formatReply(raw, emoji);
    await ctx.reply(reply, { parse_mode: "HTML" });
    return true;
  } catch (err) {
    console.error("❌ GPT Smart Error:", err);
    return false;
  }
}

module.exports = shimonSmart;

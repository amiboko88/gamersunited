// 📁 telegram/telegramTTSRoaster.js – יצירת ירידת קול בעברית עם GPT + TTS

const { Readable } = require("stream");
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateRoastVoice = async (ctx) => {
  const name = ctx.from?.first_name || "חבר";

  const prompt = `כתוב ירידת צחוק עוקצנית בעברית במשפט אחד לבנאדם בשם "${name}". בלי קללות, אבל עם חוצפה.`

  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 60
    });

    let text = gptRes.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 5 || text.length > 250) {
      console.warn("⚠️ GPT החזיר תגובה בעייתית:", text);
      return ctx.reply("😕 ה־GPT לא סיפק טקסט קול תקני. נסה שוב.");
    }

    text = text
      .replace(/["'”)\s]+$/g, "")
      .replace(/^["'“(]+/g, "")
      .trim();

    await ctx.reply("🎧 שמעון מבשל צלייה קולית...");

    const tts = await openai.audio.speech.create({
      model: "tts-1-hd",
      input: text,
      voice: "onyx"
    });

    const buffer = Buffer.from(await tts.arrayBuffer());

    if (!buffer || buffer.length < 2000) {
      console.warn("❌ Buffer קצר או ריק מ־TTS:", buffer.length);
      return ctx.reply("🎧 שמעון השתתק – הקול לא נוצר כראוי. נסה שוב.");
    }

    const caption = `🎤 ${text}`;
    await ctx.replyWithVoice({ source: Readable.from(buffer) }, {
      caption: caption.slice(0, 1000),
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ generateRoastVoice error:", err);
    const msg = err.name === "AbortError"
      ? "⌛ שמעון התעייף מהמתנה ל־GPT. נסה שוב."
      : "🔌 שמעון נתקע באמצע הצלייה. נסה שוב מאוחר יותר.";
    await ctx.reply(msg);
  }
};

module.exports = { generateRoastVoice };

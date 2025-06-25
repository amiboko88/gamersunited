const fetch = require("node-fetch");
const { Readable } = require("stream");

const generateRoastVoice = async (ctx) => {
  const name = ctx.from?.first_name || "חבר";

  const prompt = `כתוב ירידת צחוק עוקצנית בעברית במשפט אחד לבנאדם בשם "${name}". בלי קללות, אבל עם חוצפה.`

  try {
    // מגבלת זמן ל־GPT
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 שניות

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.85,
        max_tokens: 60
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const gptData = await gptRes.json();
    let text = gptData?.choices?.[0]?.message?.content?.trim();

    // ניקוי טקסט מסוכן
    if (!text || text.length < 5 || text.length > 250) {
      console.warn("⚠️ GPT החזיר תגובה בעייתית:", text);
      return ctx.reply("😕 ה־GPT לא סיפק טקסט קול תקני. נסה שוב.");
    }

    // ניקוי סוגרים או מרכאות בסוף
    text = text.replace(/["'”)\s]+$/g, "").replace(/^["'“(]+/g, "");

    await ctx.reply("🎧 שמעון מבשל צלייה קולית...");

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: text,
        voice: "onyx"
      })
    });

    const arrayBuffer = await ttsRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
    if (err.name === "AbortError") {
      await ctx.reply("⌛ שמעון התעייף מהמתנה ל־GPT. נסה שוב.");
    } else {
      await ctx.reply("🔌 שמעון נתקע באמצע הצלייה. נסה שוב מאוחר יותר.");
    }
  }
};

module.exports = { generateRoastVoice };

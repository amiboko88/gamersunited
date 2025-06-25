// 📁 telegramTTSRoaster.js – גרסה מחוזקת ל־TTS קול

const fetch = require("node-fetch");
const { Readable } = require("stream");

const generateRoastVoice = async (ctx) => {
  const name = ctx.from?.first_name || "חבר";

  // 🧠 Prompt קצר למניעת תקלות
  const prompt = `כתוב ירידת צחוק עוקצנית בעברית במשפט אחד לבנאדם בשם "${name}". בלי קללות, אבל עם חוצפה.`;

  try {
    // ⏳ מגבלת זמן ל־GPT
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
    const text = gptData?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 5 || text.length > 300) {
      return ctx.reply("😕 GPT חזר עם תשובה מוזרה או ארוכה מדי. נסה שוב.");
    }

    await ctx.reply("🎧 צלייה קולית בדרך..."); // הודעה מקדימה

    // 🎙️ בקשת קול
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

    // 🛡️ בדיקת Buffer
    if (!buffer || buffer.length < 1000) {
      console.warn("⚠️ Buffer קצר או שגוי מה־TTS:", buffer.length);
      return ctx.reply("🎧 משהו השתבש ביצירת הקול. נסה שוב.");
    }

    // ✅ שליחה כקול בטלגרם
    await ctx.replyWithVoice({ source: Readable.from(buffer) }, {
      caption: `🎤 ${text}`,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ generateRoastVoice error:", err);
    if (err.name === "AbortError") {
      await ctx.reply("⌛ GPT איטי מדי. תנסה עוד כמה שניות.");
    } else {
      await ctx.reply("🔌 שמעון נתקע באמצע הצלייה. נסה שוב אחר כך.");
    }
  }
};

module.exports = { generateRoastVoice };

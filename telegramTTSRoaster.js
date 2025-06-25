const fetch = require("node-fetch");
const { Readable } = require("stream");

const generateRoastVoice = async (ctx) => {
  const name = ctx.from?.first_name || "חבר";
  const prompt = `כתוב ירידת צחוק עוקצנית בעברית עבור מישהו בשם "${name}", כאילו אתה בוט בשם שמעון. בלי לקלל ישירות, אבל עם טון חד.`

  try {
    // GPT
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9
      })
    });

    const gptData = await gptRes.json();
    const text = gptData?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return ctx.reply("😕 לא הצלחתי לנסח ירידה הפעם.");
    }

    // TTS
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

    if (!buffer || buffer.length < 1000) {
      return ctx.reply("🎧 משהו השתבש ביצירת הקול.");
    }

    // שליחה לטלגרם
    await ctx.replyWithVoice({ source: Readable.from(buffer) }, {
      caption: `🎤 ${text}`,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ generateRoastVoice error:", err);
    await ctx.reply("🔌 שמעון נפל על השכל. נסה שוב אחר כך.");
  }
};

module.exports = { generateRoastVoice };

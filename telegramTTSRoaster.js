
const fetch = require("node-fetch");
const { Readable } = require("stream");

const generateRoastVoice = async (ctx) => {
  const name = ctx.from?.first_name || "חבר";
  const prompt = `כתוב ירידת צחוק עוקצנית וקולעת בעברית עבור מישהו בשם "${name}", כאילו אתה בוט חצוף בשם שמעון. בלי לקלל ישירות.`;
  
  // 1. קבל טקסט מה-GPT
  const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.95
    })
  });
  const data = await gptRes.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return ctx.reply("😕 לא הצלחתי לנסח ירידה הפעם.");

  // 2. המר לטקסט-לדיבור בעברית עם קול ברור
  const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: text,
      voice: "onyx" // קול גברי, עוקצני
    })
  });

  const buffer = Buffer.from(await ttsRes.arrayBuffer());

  // 3. שלח כהודעת קול בטלגרם
  await ctx.replyWithVoice({ source: Readable.from(buffer) });
};

module.exports = { generateRoastVoice };

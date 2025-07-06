// antiSpam.js
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const spamMap = new Map();

async function isSpam(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message?.text?.trim() || "";
  if (!text || text.length < 2) return false;

  const now = Date.now();
  const userData = spamMap.get(userId) || {
    lastText: "",
    count: 0,
    lastTime: now
  };

  if (userData.lastText === text) {
    userData.count++;
  } else {
    userData.count = 1;
    userData.lastText = text;
  }

  const tooFast = now - userData.lastTime < 10000;
  userData.lastTime = now;

  spamMap.set(userId, userData);

  const isSpammer = userData.count >= 3 || tooFast;

  if (isSpammer) {
    try {
      const prompt = `
משתמש בטלגרם מציף את הקבוצה עם הודעות חוזרות או בתדירות גבוהה:
"${text}"
ענה אליו בעוקצנות בסגנון שמעון – קצר, חד, בלי שמות, בלי מרכאות, ובלי קללות.
`;      
      const gptRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.85,
        max_tokens: 50
      });
      const reply = gptRes.choices?.[0]?.message?.content?.trim();
      if (reply) await ctx.reply(`‏${reply}`, { parse_mode: "HTML" });
    } catch (err) {
      console.error("❌ GPT AntiSpam Error:", err);
    }
    return true;
  }

  return false;
}

module.exports = { isSpam };

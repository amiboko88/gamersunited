// 📁 telegram/generateRoastText.js – יצירת ירידה חד פעמית לפי שם

const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const fallbackRoasts = [
  name => `${name} זה כמו return null בצ'אט – פשוט מיותר.`,
  name => `${name} מדבר הרבה, אבל שומעים רק רעש רקע.`,
  name => `כש${name} מדבר – גם הקיר מחפש את ה־exit.`,
  name => `לא ברור אם ${name} מתלונן או פשוט עושה debug לעצמו.`,
  name => `ל${name} יש פינג גבוה גם בשיחות פנים מול פנים.`
];

async function generateRoastText(name) {
  const prompt = `
אתה בוט בשם שמעון.
כתוב ירידת צחוק בעברית לבן אדם בשם "${name}".
חייב להיות משפט אחד בלבד – חד, מצחיק, עוקצני.
בלי הקדמה, בלי הסברים, בלי ברברת.
בלי פתיחים כמו "הנה ירידה" או "שמעון אומר".
`.trim();

  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.95,
      presence_penalty: 0.8,
      max_tokens: 60
    });

    let text = gptRes.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 5 || text.length > 200) {
      return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)](name);
    }

    return text.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "");
  } catch (err) {
    console.error("❌ generateRoastText error:", err);
    return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)](name);
  }
}

module.exports = { generateRoastText };

const fetch = require("node-fetch");

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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.95,
        presence_penalty: 0.8,
        max_tokens: 60
      })
    });

    const data = await response.json();
    let text = data?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 5 || text.length > 200) {
      return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)](name);
    }

    text = text.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "");

    return text;
  } catch (err) {
    console.error("❌ generateRoastText error:", err);
    return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)](name);
  }
}

module.exports = { generateRoastText };

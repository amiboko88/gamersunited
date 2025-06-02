const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getShimonReply({ text, displayName = '', profileLine = '', mood = null, isAdmin = false }) {
  let prompt = `אתה שמעון, בוט גיימרים ישראלי (סרקסטי, בוגר).`;
  if (isAdmin) prompt += ' המשתמש אדמין – תן לו כבוד, אבל באופי שלך.';
  if (profileLine) prompt += ` משפט אישי: "${profileLine}"`;
  prompt += `\nמישהו כתב: "${text}"\nתגיב בעברית בלבד, קצר, סרקסטי, ציני, עם וייב של גיימרים.`;

  let reply = null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.93,
      max_tokens: 120
    });
    reply = res.choices[0]?.message?.content?.trim()?.replace(/^"|"$/g, "") || null;
  } catch (err) {
    reply = "שמעון קצת עמוס. נסה שוב בעוד רגע!";
  }
  return reply;
}

module.exports = { getShimonReply };

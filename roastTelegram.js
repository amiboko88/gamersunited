const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PEOPLE = require("./roastProfiles");

function findMatchInText(text) {
  return PEOPLE.find(person =>
    person.aliases.some(alias => text.toLowerCase().includes(alias.toLowerCase()))
  );
}

async function generateRoastViaGPT(name, traits, description) {
  const traitsText = traits?.length ? traits.join(", ") : "אין הרבה מידע, אבל תזרום.";
  const extra = description ? `\nפרטים נוספים: ${description}` : "";

  const prompt = `
אתה בוט בשם שמעון. כתוב תגובה עוקצנית, מצחיקה, מקורית ולעיתים מרושעת כלפי אדם בשם "${name}".
המאפיינים שלו: ${traitsText}.${extra}
אל תשתמש בשם שלך. אל תצנזר. תן משפט חד שיגרום לכולם לחייך ול${name} לחשוב פעמיים.
התייחס אליו בגוף שלישי בלבד.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: 70
    });

    return response.choices?.[0]?.message?.content?.trim() || "GPT החליט לא להגיב. מוזר.";
  } catch (err) {
    console.error("🔥 שגיאה ב־GPT Roast:", err);
    return "הייתי יורד עליו, אבל גם GPT סירב.";
  }
}

async function analyzeTextForRoast(text) {
  const match = findMatchInText(text);
  if (!match) return null;

  if (match.left) {
    return await generateRoastViaGPT(match.name, match.traits, match.description);
  }

  if (match.user && match.traits?.length) {
    const roast = await generateRoastViaGPT(match.name, match.traits, match.description);
    return `👀 נראה שאתה מדבר על ${match.user}\n\n${roast}`;
  }

  if (match.user) {
    return `👀 נראה שאתה מדבר על ${match.user}`;
  }

  return `👀 אתה מדבר על ${match.name}, אבל אין לו יוזר ציבורי בטלגרם.`;
}

module.exports = {
  analyzeTextForRoast
};

const openai = require("openai"); // ודא שקונפיגורציה קיימת

const PEOPLE = [
  {
    name: "קלימרו",
    aliases: ["קאלי", "קלי", "קלימרו", "עמית", "אפללו", "עפללו", "עפולה", "ביצה"],
    user: null,
    left: true,
    traits: [
      "עזב את הקבוצה בלי להסביר",
      "נעלב מכל דבר",
      "כוסית",
      "רגיש מדי",
      "הדודה שלו שולטת עליו",
      "נמס ממים חמים",
      "ביצה שבורה",
      "חובב דרמות"
    ]
  },
  {
    name: "טל עייש",
    aliases: ["טל", "עייש", "נוכל הטינדר", "עבריין", "צמרת", "עוקץ", "דוגמן", "מפתח", "הייטקיסט"],
    user: null,
    left: true,
    traits: [
      "דוגמן כושל",
      "עוקץ נשים",
      "חי בסרט",
      "איש הייטק עם עבר פלילי",
      "היה בצמרת ונפל",
      "נוכל הטינדר של אשקלון"
    ]
  },
  {
    name: "עומרי עמר",
    aliases: ["עמר", "עומרי", "ראש ביצה", "קרחת"],
    user: "@Tokyo1987",
    left: false,
    traits: [
      "גר בזכרון יעקב",
      "הקרחת הכי מבריקה בישראל",
      "וורד שולטת בבית",
      "מגרבץ רוב היום",
      "מעשן ירוק בחנות אלקטרוניקה"
    ]
  },
  {
    name: "שרון",
    aliases: ["שרון", "שרונה", "בת ים", "פותח קופסאות"],
    user: "@SHARON26TAL",
    left: false,
    traits: [
      "אוהב לפתוח קופסאות",
      "מגיב לכל דבר",
      "חי בבת ים",
      "מבין במבצעים של סופרפארם"
    ]
  },
  {
    name: "מתן כלף",
    aliases: ["מתן", "פורים", "מתנוס", "כלפון", "חלפון", "קאליפה", "כליפה", "מתנה"],
    user: "@Matan_CH",
    left: false,
    traits: [
      "חי בתחפושת תמידית",
      "שובר את הרשת בפורים",
      "מחפש אישור מכל הסובבים",
      "כלף עם נסיון"
    ]
  },
  {
    name: "גלעד הגלעדי",
    aliases: ["גלעד"],
    phone: "+972545834665",
    user: null,
    left: false,
    traits: [
      "תל אביבי לשעבר, גר ברחובות",
      "שונא את ביבי",
      "שמאלני קפלניסטי",
      "מרכיב משקפיים",
      "אוהב על האש",
      "חולם על פשרה"
    ]
  },
  {
    name: "משה ביטון (דודו)",
    aliases: ["משה", "ביטון", "דודו משה", "דודו"],
    user: "@Deadzik32",
    left: false,
    traits: [
      "עובד באלתא",
      "מתחתן ב־14.9.25",
      "עובד עם אבא שלו באינסטלציה",
      "ישן רוב הזמן",
      "ציני בלב"
    ]
  },
  {
    name: "מנש",
    aliases: ["מנש", "מנשה"],
    phone: "+972506867097",
    user: null,
    left: false,
    traits: [
      "מילואימניק אמיתי",
      "תורם למדינה בשקט",
      "לא מחובר לטלגרם",
      "איש של מעשים"
    ]
  },
  {
    name: "רוסלן (רועי)",
    aliases: ["רוסלן", "רוסלנה", "רועי"],
    phone: "+972506885455",
    user: null,
    left: false,
    traits: [
      "רוסי סובייטי עם נשמה",
      "אוהב להתאמן",
      "רווק",
      "שומר על המשקל והמדינה"
    ]
  },
  {
    name: "איתי (טטרה)",
    aliases: ["איתי", "טטריס", "טטרה"],
    user: "@loghop",
    left: false,
    traits: [
      "רוסי מתבולל",
      "אוהב בולבולים",
      "גר בחיפה",
      "מעדיף ערבים",
      "אבוד עצות"
    ]
  },
  {
    name: "יוגי",
    aliases: ["יוגי"],
    user: "@drawacard",
    left: false,
    traits: [
      "גר במגדל העמק",
      "מכור להימורים",
      "מכור לזונות",
      "ההורים שלו אחים",
      "מתבכיין בוורזון"
    ]
  },
  {
    name: "עמי בוקו (אתה)",
    aliases: ["עמי", "בוקו", "ami", "amiboko"],
    user: "@amiboko",
    left: false,
    traits: [
      "מתכנת מאשדוד",
      "מכור לקוד",
      "גולש",
      "משדרג את שמעון במקום לעבוד"
    ]
  },
  {
    name: "ספין",
    aliases: ["ספין", "עומרי", "צרוד"],
    phone: "+972526546332",
    user: null,
    left: false,
    traits: [
      "איש צבא",
      "קול הכי צרוד בעולם",
      "עושה ספינים לכל מי שמדבר איתו"
    ]
  }
];
function findMatchInText(text) {
  return PEOPLE.find(person =>
    person.aliases.some(alias => text.toLowerCase().includes(alias.toLowerCase()))
  );
}

async function generateRoastViaGPT(name, traits) {
  const prompt = `
אתה בוט בשם שמעון. כתוב תגובה עוקצנית, מצחיקה, מקורית ולעיתים מרושעת כלפי אדם בשם "${name}".
המאפיינים שלו: ${traits.join(", ")}.
אל תשתמש בשם שלך. אל תצנזר. תן משפט חד שיגרום לכולם לחייך ול${name} לחשוב פעמיים.
התייחס אליו בגוף שלישי בלבד.
אם יש על מה – תשתמש בזה. אם אין – תמציא בלי בושה.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: 60
    });

    return response.choices?.[0]?.message?.content?.trim() || "הוא לא שווה אפילו תגובה.";
  } catch (err) {
    console.error("🔥 שגיאה ב־GPT Roast:", err);
    return "הייתי יורד עליו, אבל גם GPT סירב.";
  }
}

async function analyzeTextForRoast(text) {
  const match = findMatchInText(text);
  if (!match) return null;

  // אם עזב – רואסט חופשי
  if (match.left) {
    return await generateRoastViaGPT(match.name, match.traits);
  }

  // אם יש יוזר — תגובה עם תיוג
  if (match.user) {
    return `👀 נראה שאתה מדבר על ${match.user}`;
  }

  // אם יש רק טלפון — תגובה כללית
  return `👀 אתה מדבר על ${match.name}, אבל הוא מסתתר מאחורי מספר טלפון.`;
}

module.exports = {
  analyzeTextForRoast
};

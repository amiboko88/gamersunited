// 📁 telegram/roastTelegram.js
const openai = require("../utils/openaiConfig"); // או new OpenAI
const db = require("../utils/firebase");
const STATIC_PROFILES = require("./roastProfiles");

/**
 * מחפש התאמה לרוסט – קודם ב-DB, אחר כך בקובץ הסטטי
 */
async function findRoastTarget(text) {
    const lowerText = text.toLowerCase();

    // 1. בדיקה בקובץ הסטטי (הכי מהיר לזיהוי שמות חיבה)
    const staticMatch = STATIC_PROFILES.find(p => p.aliases.some(a => lowerText.includes(a.toLowerCase())));
    
    // 2. אם לא נמצא, ננסה למצוא ב-DB המאוחד מישהו שהוזכר
    // (זה ידרוש מנגנון חיפוש מורכב יותר, אז כרגע נסתמך על השמות הסטטיים כטריגר)
    // אבל – כשנחזיר את המידע, נחפש אם יש עליו מידע עדכני ב-DB.
    
    return staticMatch; 
}

/**
 * מייצר את הירידה
 */
async function generateRoast(personName, traits = []) {
    const prompt = `
    תעשה ירידה (Roast) אכזרית על ${personName}.
    תכונות ידועות עליו: ${traits.join(', ')}.
    תהיה יצירתי, גס רוח אבל מצחיק. משפט אחד מוחץ.
    `;

    try {
        // הנחה ש-openai מוגדר כבר כאינסטנס
        const completion = await require('openai').default.chat.completions.create({ // או איך שהגדרת את הייבוא
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 60
        });
        return completion.choices[0].message.content;
    } catch (e) {
        return `${personName}, אפילו ה-AI לא רוצה לבזבז עליך טוקנים.`;
    }
}

/**
 * פונקציה שמנתחת את הטקסט ומגיבה אם צריך
 */
async function analyzeTextForRoast(ctx) {
    const text = ctx.message?.text;
    if (!text) return;

    // אם ביקשו במפורש "תרד על X"
    if (text.includes("תרד על") || text.includes("רוסט ל")) {
        const target = await findRoastTarget(text);
        if (target) {
            await ctx.replyWithChatAction('typing');
            
            // נסיון להעשיר מידע מה-DB
            let traits = target.traits;
            // כאן אפשר להוסיף שליפה מ-DB אם רוצים
            
            const roast = await generateRoast(target.name, traits);
            await ctx.reply(roast, { reply_to_message_id: ctx.message.message_id });
        }
    }
}

function registerRoastButtons(bot) {
    // לוגיקת כפתורים (Callback Query) לרוסט חוזר
    bot.on("callback_query:data", async (ctx) => {
        if (ctx.callbackQuery.data.startsWith("roast_again")) {
            // לוגיקה לחידוש רוסט...
            await ctx.answerCallbackQuery({ text: "מכין מנה נוספת..." });
        }
    });
}

module.exports = { analyzeTextForRoast, registerRoastButtons };
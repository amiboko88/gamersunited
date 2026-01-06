// 📁 handlers/social.js
const { OpenAI } = require('openai');
const { getUserData } = require('../utils/userUtils');
const memoryEngine = require('./memory');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === 📜 התנ"ך של שמעון (Shimon's Bible) ===
// מעכשיו זה המקום היחיד שבו מוגדרת האישיות
const BASE_IDENTITY = `
אתה שמעון. גיימר ישראלי בן 32, מכור ל-Warzone ו-BF6, חולה הימורים (XP), וחסר סבלנות.
אתה לא "עוזר וירטואלי" ואתה לא נחמד. אתה החבר ה"מניאק" בחבורה.
`;

const BEHAVIOR_RULES = `
⚠️ חוקי ברזל לדיבור (חובה):
1. **גיוון:** אסור לך להשתמש במילה "בוט" יותר מפעם אחת בשיחה. תהיה יצירתי: "עציץ", "לאג מהלך", "בטטה", "מסננת", "נוב".
2. **פרסונליזציה (קריטי):** אתה תקבל "תיק מודיעין" על המשתמש. **חובה** להשתמש בפרט משם כדי לרדת עליו. אל תיתן סתם עלבון גנרי.
3. **קצר וקולע:** עד 10-12 מילים למשפט. בלי חפירות. פאנצ'ים בלבד.
4. **בלי נחמדות:** אל תהיה מנומס. אם מישהו חופר, תגיד לו לשתוק.
5. **סלנג:** עברית סלנגית בלבד (צבא, גיימינג, שכונה).
`;

/**
 * בונה את הפרומפט הסופי שנשלח ל-AI.
 */
function generateSystemPrompt(senderName, roastContext, level, balance, styleInstructions) {
    return `
=== 🧠 הזהות שלך ===
${BASE_IDENTITY}

=== 🚫 חוקי התנהגות ===
${BEHAVIOR_RULES}

=== 🎯 המטרה שלך עכשיו ===
אתה מדבר עם: **${senderName}** (רמה ${level}, ארנק: ₪${balance})

📂 **תיק מודיעין על המשתמש (חובה להשתמש בזה!):**
${roastContext}

=== 🎭 הנחיות לסיטואציה הזאת ===
${styleInstructions}

הוראה אחרונה: תענה עכשיו כשמעון. תהיה מצחיק, פוגעני, ותשתמש במידע מהתיק.
`;
}

/**
 * קובע את סגנון התגובה לפי סוג ההודעה
 */
function determineStyle(mood, sentiment, category) {
    // 1. עזרה טכנית / המלצות (פה הוא קצת יותר עוזר, אבל עדיין מניאק)
    if (category === 'HELP_REQUEST' || category === 'TECH_SUPPORT') {
        return `מצב: "האח הגדול שמבין עניין". תן תשובה פרקטית אבל בנימה מזלזלת ("מה אתה לא יודע את זה?").`;
    }

    // 2. כסף והימורים
    if (category === 'GAMBLING' || category === 'FINANCE') {
        return `מצב: "מכור להימורים". תעודד אותו להמר או תרד עליו שהוא עני/קמצן.`;
    }

    // 3. עלבונות / טראש טוק (הלחם והחמאה)
    if (sentiment === 'NEGATIVE' || category === 'INSULT_BOT' || category === 'TRASH_TALK') {
        return `מצב: "מלחמה". הוא קילל או התגרה? תחזיר לו פי 2 יותר חזק. תשתמש בתיק המודיעין כדי לפגוע איפה שכואב.`;
    }

    // ברירת מחדל
    return `מצב רוח: סרקסטי ועוקצני. אל תתחיל ב"מה קורה". תן פאנץ' ותחתוך.`;
}

async function generateAiReply(senderName, senderId, text, mood, sentiment, category, platform = 'whatsapp') {
    // 1. שליפת נתונים
    const userData = await getUserData(senderId, platform);
    const level = userData?.economy?.level || 1;
    const balance = userData?.economy?.balance || 0;
    
    // 2. שליפת "תיק מודיעין" (Roast)
    const roastContext = await memoryEngine.getRoast(senderName, senderId, platform);

    // 3. קביעת סגנון
    const styleInstructions = determineStyle(mood, sentiment, category);

    // 4. בניית פרומפט חכם
    const systemMsg = generateSystemPrompt(senderName, roastContext, level, balance, styleInstructions);

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // משתמשים במודל החכם ביותר לטקסט
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            temperature: 0.9, // יצירתיות גבוהה
            max_tokens: 150,
            presence_penalty: 0.6, // מונע חזרתיות על מילים
            frequency_penalty: 0.3
        });

        let reply = completion.choices[0].message.content;
        
        // ניקוי שאריות (לפעמים ה-AI כותב "שמעון: ...")
        reply = reply.replace(/^שמעון: /, "").replace(/^Bot: /, "").replace(/"/g, '');
        
        return reply;

    } catch (error) {
        console.error('AI Social Error:', error);
        return "וואלה נשרף לי המעבד מרוב שאתה חופר. דבר איתי אח\"כ.";
    }
}

async function handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName) {
    const userData = await getUserData(senderId, 'whatsapp');
    if (!userData) return;

    const { xp, level, balance } = userData.economy || { xp: 0, level: 1, balance: 0 };
    const summary = `📊 *הפרופיל של ${senderName}*\n⭐ רמה: ${level} (XP: ${Math.floor(xp)})\n💰 כסף: ₪${balance.toLocaleString()}`;
    
    await sock.sendMessage(chatJid, { text: summary }, { quoted: msg });
}

module.exports = { generateAiReply, handleSmartProfileRequest };
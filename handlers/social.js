// 📁 handlers/social.js
const { OpenAI } = require('openai');
const { getUserData } = require('../utils/userUtils');
const memoryEngine = require('./memory');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🎭 המטריצה הרגשית (הועברה מהוואטסאפ למוח הראשי)
 */
function determineStyle(mood, sentiment, category, senderName, balance) {
    // 1. עזרה טכנית / המלצות
    if (category === 'HELP_REQUEST' || category === 'TECH_SUPPORT') {
        return `
        🧠 מצב: "האח הגדול שמבין עניין".
        הוראות:
        - תן תשובה פרקטית ואמיתית.
        - ציין שמות של חנויות בישראל (KSP, Ivory, Zap).
        - סגנון: "שמע יא גבר, אל תהיה פראייר, תבדוק בזאפ קודם."
        `;
    }

    // 2. פיננסים / פרופיל
    if (category === 'FINANCE' || category === 'PROFILE') {
        return `
        💰 מצב: "מנהל בנק בשוק האפור".
        למשתמש יש ₪${balance}.
        הוראות:
        - אם יש לו קצת כסף: רד עליו שהוא עני.
        - אם יש לו הרבה: תציע לו להמר בקזינו.
        `;
    }

    // 3. גיימינג / הזמנות
    if (category === 'GAMING' || category === 'GAMING_INVITE') {
        return `
        🎮 מצב: "גיימר טוקסיק".
        הוראות:
        - השתמש בסלנג: נוב, לאג, פינג, קמפר, בוט.
        - זלזל בכישורים שלו אבל תזרום עם ההזמנה.
        `;
    }

    // 4. עלבונות / מריבות
    if (sentiment === 'NEGATIVE' || category === 'INSULT_BOT' || category === 'TRASH_TALK') {
        return `
        🔥 מצב: "פה ג'ורה".
        הוראות:
        - תחזיר לו כפליים.
        - אל תהיה מנומס.
        - רד לפסים אישיים (על בסיס הזיכרון).
        `;
    }

    // ברירת מחדל
    return `מצב רוח: סרקסטי ועוקצני. אל תתחיל ב"מה קורה". תהיה קצר.`;
}

// בניית הפרומפט
function generateSystemPrompt(senderName, roastContext, level, balance, styleInstructions) {
    return `
    אתה שמעון. גיימר ישראלי בן 32, עצבני וציני.
    
    👤 משתמש: ${senderName} (רמה ${level}, ₪${balance})
    🧠 מידע עליו (לירידות): ${roastContext}
    
    🎭 הנחיות סגנון:
    ${styleInstructions}
    
    חוקי ברזל:
    1. תשובות קצרות (משפט או שניים).
    2. בלי "שלום" ובלי "מה קורה".
    3. עברית סלנגית בלבד.
    `;
}

async function generateAiReply(senderName, senderId, text, mood, sentiment, category, platform = 'whatsapp') {
    // 1. שליפת נתונים מה-DB המאוחד
    const userData = await getUserData(senderId, platform);
    const level = userData?.economy?.level || 1;
    const balance = userData?.economy?.balance || 0;
    
    // 2. שליפת זיכרון
    const roastContext = await memoryEngine.getRoast(senderName, senderId, platform);

    // 3. קביעת סגנון
    const styleInstructions = determineStyle(mood, sentiment, category, senderName, balance);

    // 4. בניית פרומפט
    const systemMsg = generateSystemPrompt(senderName, roastContext, level, balance, styleInstructions);

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: "מי אתה?" },
                { role: "assistant", content: "הסיוט שלך יא בוט." },
                { role: "user", content: text }
            ],
            temperature: 0.85,
            max_tokens: 150,
            presence_penalty: 0.5
        });

        let reply = completion.choices[0].message.content;
        return reply.replace(/^שמעון: /, "").replace(/^Bot: /, "");

    } catch (error) {
        console.error('AI Error:', error);
        return "וואלה נשרף לי המעבד. דבר איתי אח\"כ.";
    }
}

async function handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName) {
    const userData = await getUserData(senderId, 'whatsapp');
    if (!userData) return;

    const { xp, level, balance } = userData.economy || { xp: 0, level: 1, balance: 0 };
    
    // כאן נשתמש בטקסט פשוט כדי לא לסבך עם Canvas כרגע, אבל המידע מדויק מה-DB המאוחד
    const summary = `📊 *הפרופיל של ${senderName}*\n⭐ רמה: ${level} (XP: ${Math.floor(xp)})\n💰 כסף: ₪${balance.toLocaleString()}`;
    await sock.sendMessage(chatJid, { text: summary }, { quoted: msg });
}

module.exports = { generateAiReply, handleSmartProfileRequest };
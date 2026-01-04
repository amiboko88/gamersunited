// 📁 handlers/smartChat.js
const OpenAI = require('openai');
const { Collection, MessageFlags } = require('discord.js');
const { getUserData } = require('../utils/userUtils'); // ✅ חיבור ל-DB המאוחד
const { log } = require('../utils/logger'); // לוגר מסודר

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הגדרות מערכת
const STAFF_CHANNEL_ID = '881445829100060723'; 
const SYSTEM_INSTRUCTION_BASE = `
אתה שמעון. גיימר ישראלי בן 32, מכור ל-Warzone ו-BF6.
אתה ציני, עוקצני, חסר סבלנות, אבל נאמן לחברים שלך.
אתה מדבר בסלנג ישראלי גס ("אחי", "נודר", "בוט", "פח").
חוקים:
1. תשובות קצרות (עד 2 משפטים).
2. בלי "שלום" ובלי נימוסים.
3. אם מישהו מעצבן אותך, תרד עליו חזק.
4. השתמש במידע האישי שיסופק לך על המשתמש כדי לעקוץ אותו.
`;

const recentReplies = new Set(); // למניעת לופים של תשובות זהות

/**
 * בונה את הקונטקסט (הפרומפט) על בסיס הנתונים מה-DB
 */
async function buildSystemPrompt(userId, userName) {
    let specificContext = "";
    
    // שליפת מידע מה-DB המאוחד
    const userData = await getUserData(userId, 'discord');

    if (userData) {
        // 1. הוספת עובדות (Facts)
        const facts = userData.brain?.facts || [];
        if (facts.length > 0) {
            const relevantFacts = facts.slice(-3).map(f => f.content).join(", ");
            specificContext += `\nעובדות שידועות לך על ${userName}: ${relevantFacts}.`;
        }

        // 2. הוספת ירידות (Roasts)
        const roasts = userData.brain?.roasts || [];
        if (roasts.length > 0) {
            const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
            specificContext += `\nמשפט מחץ להשתמש בו עליו: "${randomRoast}".`;
        } else {
            // אם אין פרופיל ירידות, נמציא משהו גנרי
            specificContext += `\nאין לך היכרות עמוקה איתו, אז תאלתר ירידה על השם שלו.`;
        }

        // 3. סטטוס כלכלי
        const balance = userData.economy?.balance || 0;
        if (balance < 0) specificContext += `\nהוא בחובות של ${balance} שקל. תצחק עליו שהוא עני.`;
        if (balance > 5000) specificContext += `\nהוא טחון בכסף (${balance}). תבקש ממנו הלוואה.`;
    }

    return `${SYSTEM_INSTRUCTION_BASE}\nמידע על המשתמש שמולך (${userName}):${specificContext}`;
}

/**
 * פונקציה ראשית לטיפול בהודעות צ'אט (Event Handler)
 */
async function handleMessage(message) {
    if (message.author.bot) return;

    // זיהוי אם מדברים אל הבוט
    const isMentioned = message.mentions.users.has(message.client.user.id);
    const isReplyToMe = message.reference && (await message.fetchReference().catch(() => null))?.author.id === message.client.user.id;
    
    // אם לא פנו אלינו ישירות, חוקי רנדום (10% סיכוי לענות סתם ככה בקבוצות המורשות)
    if (!isMentioned && !isReplyToMe) {
        if (Math.random() > 0.1) return; 
    }

    await message.channel.sendTyping();

    // בניית אובייקט הודעה וירטואלי ושליחה ל-AI
    const response = await generateAiResponse(message.content, message.author.id, message.author.username, message.attachments);
    
    if (response) {
        await message.reply(response);
    }
}

/**
 * ✅ הפונקציה שביקשת שתהיה זמינה לכולם (smartRespond)
 * מאפשרת לקבצים אחרים (כמו AntiSpam או Modals) לקבל תשובה משמעון.
 * @param {Object} messageObject - אובייקט שמחקה הודעת דיסקורד (content, author, member)
 */
async function smartRespond(messageObject) {
    const userId = messageObject.author?.id || messageObject.member?.id;
    const username = messageObject.author?.username || messageObject.member?.displayName || "User";
    
    // קריאה לליבה
    const response = await generateAiResponse(messageObject.content, userId, username);
    
    // אם ההודעה המקורית היא אינטראקציה או משהו אחר, הטיפול בתשובה באחריות הקורא
    // אבל אם העברנו הודעה אמיתית, אפשר להגיב לה כאן (אופציונלי).
    // כרגע נחזיר את הטקסט כדי שהקוד הקורא יעשה איתו מה שצריך.
    return response; 
}

/**
 * הליבה של ה-AI: שולחת בקשה ל-OpenAI ומחזירה טקסט.
 */
async function generateAiResponse(text, userId, username, attachments = new Collection()) {
    try {
        const systemPrompt = await buildSystemPrompt(userId, username);
        const messages = [{ role: "system", content: systemPrompt }];

        // טיפול בתמונות (Vision)
        let userContent = [{ type: "text", text: text }];
        const image = attachments.find(a => a.contentType?.startsWith('image/'));
        if (image) {
            userContent.push({ type: "image_url", image_url: { url: image.url } });
            log(`[SmartChat] 🖼️ תמונה זוהתה מ-${username}`);
        }

        messages.push({ role: "user", content: userContent });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // המודל החכם ביותר
            messages: messages,
            max_tokens: 150,
            temperature: 0.9, // יצירתיות גבוהה
            presence_penalty: 0.3 // מגוון
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        
        // מניעת חזרתיות (ספאם)
        if (recentReplies.has(reply)) return null;
        recentReplies.add(reply);
        if (recentReplies.size > 20) recentReplies.delete([...recentReplies][0]);

        return reply;

    } catch (error) {
        console.error('[SmartChat] ❌ Error:', error.message);
        return "וואלה נשרף לי המוח רגע. נסה אחר כך.";
    }
}

/**
 * ✅ פיצ'ר 2026: בדיקת בטיחות תוכן (מחליף את רשימות המילים הקשיחות)
 * משתמש ב-OpenAI Moderation API (חינם)
 * @returns {Promise<{isSafe: boolean, category: string}>}
 */
async function checkContentSafety(text) {
    try {
        const response = await openai.moderations.create({ input: text });
        const result = response.results[0];

        if (result.flagged) {
            // מוצאים את הקטגוריה הכי בולטת
            const categories = Object.keys(result.categories).filter(cat => result.categories[cat]);
            return { isSafe: false, category: categories.join(', ') };
        }
        return { isSafe: true };
    } catch (error) {
        console.error('Moderation API Error:', error);
        return { isSafe: true }; // במקרה של תקלה לא נחסום סתם
    }
}

// ייצוא הפונקציות לשימוש חיצוני
module.exports = { 
    handleMessage, 
    smartRespond, 
    checkContentSafety 
};
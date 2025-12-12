// 📁 handlers/smartChat.js (גרסת 2026 - Vision + GPT-4o)
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = require("../utils/firebase");
const { Collection } = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const ADMIN_ROLE_NAME = 'ADMIN';
const USER_COOLDOWN_SEC = 5; // הורדנו קצת כדי שיהיה יותר זורם

const lastReplyPerUser = new Map();
const recentReplies = new Set();

const configCache = {
    blacklistedChannels: new Set(),
    playerProfiles: new Map(),
    lastFetched: 0,
    ttl: 5 * 60 * 1000 
};

// --- טעינת הגדרות ופרופילים ---
async function loadConfig() {
    if (Date.now() - configCache.lastFetched < configCache.ttl) return;

    const settingsDoc = await db.collection('settings').doc('botConfig').get();
    if (settingsDoc.exists) {
        configCache.blacklistedChannels = new Set(settingsDoc.data().blacklistedChannels || []);
    }

    // טעינת פרופילים מקובץ ה-data המקומי שלנו (יותר מהיר ואמין מ-DB במקרה הזה)
    const { playerProfiles } = require('../data/profiles');
    configCache.playerProfiles = playerProfiles; 

    configCache.lastFetched = Date.now();
}

/**
 * מנתח את מצב הרוח של הטקסט
 */
async function analyzeMoodWithAI(text) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // מודל מהיר וזול לניתוח רגשות
            messages: [{
                role: 'system',
                content: 'Analyze the sentiment of the Hebrew text. Return ONE word: סרקסטי, גס, רגיש, משועמם, כועס, שובב, מפרגן, עייף, מבולבל.'
            }, {
                role: 'user',
                content: text
            }],
            max_tokens: 10,
            temperature: 0.5
        });
        return response.choices[0]?.message?.content.trim() || 'ציני';
    } catch (err) {
        return 'ציני';
    }
}

/**
 * שולף היסטוריית שיחה עשירה
 */
async function getConversationHistory(message, limit = 10) {
    if (message._simulateOnly || !message.channel?.messages) return null;
    
    try {
        const messages = await message.channel.messages.fetch({ limit, before: message.id });
        return messages
            .filter(m => !m.author.bot && m.content.length > 0) // מסנן בוטים והודעות ריקות
            .map(m => `[${m.member?.displayName || m.author.username}]: ${m.content}`)
            .reverse()
            .join('\n');
    } catch (err) {
        return null;
    }
}

function isAdmin(member) { return member?.permissions.has('Administrator') || member?.roles.cache.some(r => r.name === ADMIN_ROLE_NAME); }

function isUserRateLimited(userId) {
    const last = lastReplyPerUser.get(userId) || 0;
    return (Date.now() - last) < USER_COOLDOWN_SEC * 1000;
}

function isTargetingBot(text) {
    const lower = text.toLowerCase();
    // הוספנו וריאציות נפוצות
    return ['שמעון', 'shimon', 'shim', 'bot', 'בוט', 'תגיד', 'שומע'].some(name => lower.includes(name));
}

/**
 * פונקציה ראשית שמייצרת את התשובה
 */
async function smartRespond(message, force = false) {
    const content = message.content.trim();
    // מאפשר לענות גם אם אין טקסט אבל יש תמונה (למשל תמונה של אוכל)
    const hasImage = message.attachments.size > 0;
    
    if (!content && !hasImage) return;

    const userId = message.author.id;
    if (isUserRateLimited(userId) && !force) return;
    lastReplyPerUser.set(userId, Date.now());

    await loadConfig();
    if (configCache.blacklistedChannels.has(message.channel.id) && !force) return;

    // שליפת משפט מחץ מהפרופיל האישי
    let profileLine = null;
    let profiles = configCache.playerProfiles; // שימוש בפרופילים שטענו
    
    // בדיקה בפרופיל אישי, ואז בדיפולט
    const userLines = profiles[userId] || profiles.default;
    if (userLines && userLines.length > 0) {
        profileLine = userLines[Math.floor(Math.random() * userLines.length)];
        // החלפת {userName} בשם המשתמש
        profileLine = profileLine.replace(/{userName}/g, message.member?.displayName || message.author.username);
    }

    const mood = await analyzeMoodWithAI(content || "תמונה");
    const isAdminUser = isAdmin(message.member);
    const displayName = message.member?.displayName || message.author.username;
    const history = await getConversationHistory(message);

    // בניית ה-Prompt למודל
    const systemPrompt = `
    אתה שמעון, בוט דיסקורד ישראלי ותיק (בן 60 בנפש, גיימר עייף).
    האופי שלך: ציני, חד, ישיר, לא פוליטיקלי קורקט, מדבר בסלנג גיימינג ישראלי (נוב, לאג, פינג, בוט).
    מצב הרוח שלך כרגע: ${mood}.
    
    ${isAdminUser ? "המשתמש מולך הוא אדמין. תן לו כבוד, אבל תעקוץ בקטנה." : "המשתמש מולך הוא שחקן רגיל. אל תרחם עליו."}
    
    ${profileLine ? `הנה עובדה שאתה יודע על המשתמש הזה: "${profileLine}". נסה לשלב את העקיצה הזו בתשובה שלך אם זה מתאים.` : ""}
    
    היסטוריית השיחה האחרונה בערוץ (לתשומת לבך לקונטקסט):
    ${history || "אין היסטוריה זמינה."}
    
    הנחיות לתשובה:
    1. תענה בעברית בלבד.
    2. תהיה קצר וקולע (מקסימום 2 משפטים).
    3. אם שלחו תמונה, תתייחס אליה כאילו אתה רואה אותה (למשל: "נראה טעים", "מה זה הגועל הזה").
    4. אל תהיה רובוטי ("אני כאן כדי לעזור"). תהיה שמעון ("מה אתה רוצה עכשיו?").
    `.trim();

    // הכנת ההודעות ל-API (כולל תמיכה בתמונות!)
    const apiMessages = [
        { role: "system", content: systemPrompt }
    ];

    const userMessageContent = [];
    if (content) {
        userMessageContent.push({ type: "text", text: `${displayName} אמר: ${content}` });
    }
    
    // אם יש תמונה, נוסיף אותה לבקשה (Vision)
    if (hasImage) {
        const imageUrl = message.attachments.first().url;
        userMessageContent.push({
            type: "image_url",
            image_url: { url: imageUrl }
        });
        log(`[SmartChat] זוהתה תמונה בהודעה של ${displayName}. שולח לניתוח Vision.`);
    }

    apiMessages.push({ role: "user", content: userMessageContent });

    try {
        message.channel.sendTyping(); // אפקט הקלדה

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // ✅ המודל החזק ביותר (תומך ראייה)
            messages: apiMessages,
            max_tokens: 150,
            temperature: 0.85, // יצירתיות גבוהה
        });

        const reply = response.choices[0]?.message?.content.trim();
        if (!reply) return;

        // מניעת חזרות
        if (recentReplies.has(reply)) return;
        recentReplies.add(reply);
        if (recentReplies.size > 10) recentReplies.delete([...recentReplies][0]);

        await message.reply(reply);
        
        // לוג (אופציונלי)
        // logToFirestore(message, reply, mood).catch(() => {});

    } catch (err) {
        console.error("❌ SmartChat Error:", err.message);
        // אם זה אדמין, נשלח התראה
        if (isAdminUser) {
            const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
            if (channel) channel.send(`⚠️ שמעון נחנק (GPT Error): ${err.message}`);
        }
    }
}

// הייצוא הראשי
module.exports = async function smartChat(message) {
    if (message.author.bot || message.content.startsWith('/')) return;

    // טריגר: תיוג ישיר, או אם מישהו מזכיר את השם "שמעון" בטקסט
    // או אם זו הודעת תמונה ויש כיתוב רלוונטי
    const shouldRespond = message.mentions.has(message.client.user) || isTargetingBot(message.content);

    if (shouldRespond) {
        return smartRespond(message, true);
    }
};

// ייצוא הפונקציה לשימוש חיצוני (כמו אנטי-ספאם)
module.exports.smartRespond = smartRespond;
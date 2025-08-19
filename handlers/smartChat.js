// 📁 handlers/smartChat.js (מתוקן)
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = require("../utils/firebase");
const { Collection } = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const ADMIN_ROLE_NAME = 'ADMIN';
const USER_COOLDOWN_SEC = 8;

const lastReplyPerUser = new Map();
const recentReplies = new Set();

const configCache = {
    blacklistedChannels: new Set(),
    playerProfiles: new Map(),
    lastFetched: 0,
    ttl: 5 * 60 * 1000 // 5 דקות
};

async function loadConfig() {
    if (Date.now() - configCache.lastFetched < configCache.ttl) return;

    const settingsDoc = await db.collection('settings').doc('botConfig').get();
    if (settingsDoc.exists) {
        configCache.blacklistedChannels = new Set(settingsDoc.data().blacklistedChannels || []);
    }

    const profilesSnapshot = await db.collection('playerProfiles').get();
    configCache.playerProfiles.clear();
    profilesSnapshot.forEach(doc => {
        configCache.playerProfiles.set(doc.id, doc.data().lines || []);
    });

    configCache.lastFetched = Date.now();
}

async function analyzeMoodWithAI(text) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{
                role: 'system',
                content: 'Analyze the sentiment/mood of the following Hebrew text. Respond with a single Hebrew word that fits one of these categories: סרקסטי, גס רוח, רגיש, מאוהב, כועס, שובב, מפרגן, חפפן, עצוב, מבולבל, ניטרלי.'
            }, {
                role: 'user',
                content: text
            }],
            max_tokens: 10,
            temperature: 0.5
        });
        return response.choices[0]?.message?.content.trim() || 'ניטרלי';
    } catch (err) {
        console.warn("⚠️ AI mood analysis failed:", err.message);
        return 'ניטרלי';
    }
}

async function getConversationHistory(message, limit = 3) {
    // ✅ [תיקון] הוספת בדיקה שמונעת ריצה על הודעות "דמה" או הודעות ללא ערוץ תקין
    if (message._simulateOnly || !message.channel?.messages) {
        return null;
    }
    
    try {
        const messages = await message.channel.messages.fetch({ limit, before: message.id });
        return messages
            .filter(m => !m.author.bot)
            .map(m => `${m.member?.displayName || m.author.username}: ${m.content}`)
            .reverse()
            .join('\n');
    } catch (err) {
        console.warn("⚠️ Could not fetch message history:", err.message);
        return null;
    }
}

function isAdmin(member) { return member.permissions.has('Administrator') || member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME); }
function isUserRateLimited(userId) {
    const last = lastReplyPerUser.get(userId) || 0;
    return (Date.now() - last) < USER_COOLDOWN_SEC * 1000;
}
function setUserCooldown(userId) { lastReplyPerUser.set(userId, Date.now()); }
function isTargetingBot(text) {
    const lower = text.toLowerCase();
    return ['שמעון', 'shim', 'bot', 'שמעון בוט'].some(name => lower.includes(name));
}

function createPrompt({ userText, mood, displayName, profileLine, isAdminUser, history }) {
    let base = `אתה שמעון, בוט קהילתי ישראלי לגיימרים בוגרים (25+). מצב הרוח שלך: ${mood}.`;
    if (isAdminUser) base += ` המשתמש שמולך הוא אדמין – תכבד אותו אבל תתחכם!`;
    if (profileLine) base += ` הנה משפט ירידה על המשתמש כדי לתת לך קונטקסט: "${profileLine}"`;

    let context = '';
    if (history) {
        context = `הנה ההודעות האחרונות בשיחה:\n${history}\n\n`;
    }

    return `${base}
${context}עכשיו, "${displayName}" כתב: "${userText}"
תגיב לו ישירות בעברית. תהיה קצר, סרקסטי, ציני, ומקורי. התגובה שלך צריכה להתייחס ישירות להודעה שלו, וגם להקשר השיחה אם רלוונטי.`;
}

// ... שאר הקובץ נשאר ללא שינוי ...
async function logToFirestore(message, reply, mood) { /* ... */ }
async function tryModel({ model, prompt }) { /* ... */ }

async function smartRespond(message, force = false) {
    const content = message.content.trim();
    if (!content) return;

    const userId = message.author.id;
    if (isUserRateLimited(userId)) return;
    setUserCooldown(userId);

    await loadConfig();
    if (configCache.blacklistedChannels.has(message.channel.id) && !force) return;

    let profileLine = null;
    const userProfileLines = configCache.playerProfiles.get(userId);
    if (Array.isArray(userProfileLines) && userProfileLines.length > 0) {
        profileLine = userProfileLines[Math.floor(Math.random() * userProfileLines.length)];
    }

    const mood = await analyzeMoodWithAI(content);
    const isAdminUser = message.member ? isAdmin(message.member) : false;
    const displayName = message.member?.displayName || message.author.username || "משתמש";
    
    const history = await getConversationHistory(message);

    const prompt = createPrompt({ userText: content, mood, displayName, profileLine, isAdminUser, history });
    let reply = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const modelToUse = message._simulateOnly ? 'gpt-3.5-turbo' : (attempt === 0 ? 'gpt-4o' : 'gpt-3.5-turbo');
            reply = await tryModel({ model: modelToUse, prompt });
            if (!recentReplies.has(reply)) break;
        } catch (err) {
            if (attempt === 0 && !message._simulateOnly) {
                const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
                if (channel) channel.send(`⚠️ GPT-4o נפל: ${err.code || err.status}`);
            }
        }
    }
    
    if (!reply) {
        // [הבהרה] עבור הודעות אוטומטיות, נחזיר את התוכן במקום לשלוח אותו
        if (message._simulateOnly) {
           return null;
        }
        return;
    }
   
    recentReplies.add(reply);
    if (recentReplies.size > 6) recentReplies.delete([...recentReplies][0]);
   
    // [הבהרה] החזרת התוכן עבור הודעות אוטומטיות
    if (message._simulateOnly) {
       return reply;
    }

    await message.reply({ content: reply });
    logToFirestore(message, reply, mood).catch(() => {});
}

module.exports = async function smartChat(message) {
    if (message.author.bot || message.content.startsWith('/')) return;

    if (isTargetingBot(message.content)) {
        return smartRespond(message, true);
    }
};

module.exports.smartRespond = smartRespond;
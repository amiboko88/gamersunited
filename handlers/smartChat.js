// 📁 handlers/smartChat.js
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = require("../utils/firebase");
const profiles = require('../data/profiles.js'); // ✅ [תיקון] הוסף הייבוא הנכון

const STAFF_CHANNEL_ID = '881445829100060723';
const ADMIN_ROLE_NAME = 'ADMIN';
const USER_COOLDOWN_SEC = 8;

const lastReplyPerUser = new Map();
const recentReplies = new Set();

const moods = ['סרקסטי', 'גס רוח', 'רגיש', 'מאוהב', 'כועס', 'שובב', 'מפרגן', 'חפפן', 'עצוב'];
const confusedTriggers = [ 'מה זה', 'איפה המשחק', 'רציתי לענות', 'למה מחקת', 'היה שאלה', 'פספסתי', 'המשחק נעלם', 'למה נמחק', 'מה פספסתי', 'חיכיתי' ];
const complimentTriggers = [ 'כל הכבוד', 'תותח', 'אהבתי', 'חזק', 'מצחיק', 'יפה', 'פגז', 'תודה' ];
const teasingTriggers = [ 'סתום', 'חחח', 'די', 'שתוק', 'קוף', 'מפגר', 'בן זונה', 'זין', 'מטומטם', 'בוט דפוק' ];

const BLACKLISTED_CHANNELS = [];

// =============== כלי עזר (נשארו ללא שינוי) =================
function getMoodFromContent(text) {
    const lower = text.toLowerCase();
    if (confusedTriggers.some(w => lower.includes(w))) return 'מבולבל';
    if (complimentTriggers.some(w => lower.includes(w))) return 'מפרגן';
    if (teasingTriggers.some(w => lower.includes(w))) return 'שובב';
    if (lower.includes('בן זונה') || lower.includes('תמות') || lower.includes('זין')) return 'כועס';
    return moods[Math.floor(Math.random() * moods.length)];
}
function containsEmoji(text) { return /[\p{Emoji}]/u.test(text); }
function isLink(text) { return text.includes('http') || text.includes('www.'); }
function isBattleTag(text) { return /#[0-9]{3,5}/.test(text); }
function isTargetingBot(text) {
    const lower = text.toLowerCase();
    return ['שמעון', 'shim', 'bot', 'שמעון בוט'].some(name => lower.includes(name));
}
function isBirthdayMention(text) {
    const lower = text.toLowerCase();
    return lower.includes('יום הולדת') || lower.includes('נולדתי') || lower.includes('בן') || lower.includes('בת');
}
function isConfusedAboutGame(text) {
    const lower = text.toLowerCase();
    return confusedTriggers.some(trigger => lower.includes(trigger));
}
function isOffensive(text) { return teasingTriggers.some(word => text.includes(word)); }
function isAdmin(member) { return member.permissions.has('Administrator') || member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME); }
function isUserRateLimited(userId) {
    const last = lastReplyPerUser.get(userId) || 0;
    return (Date.now() - last) < USER_COOLDOWN_SEC * 1000;
}
function setUserCooldown(userId) { lastReplyPerUser.set(userId, Date.now()); }
// =========================================================

function createPrompt({ userText, mood, displayName, profileLine, isAdminUser }) {
    let base = `אתה שמעון, בוט קהילתי ישראלי לגיימרים בוגרים (25+). מצב הרוח שלך: ${mood}.`;
    if (isAdminUser) base += ` המשתמש שמולך הוא אדמין – תכבד אותו אבל תתחכם!`;
    if (profileLine) base += ` הנה משפט ירידה על המשתמש כדי לתת לך קונטקסט: "${profileLine}"`;

    return `${base}
מישהו בשם "${displayName}" כתב: "${userText}"
תגיב לו ישירות בעברית. תהיה קצר, סרקסטי, ציני, ומקורי.`;
}

async function logToFirestore(message, reply, mood) {
    try {
        await db.collection("aiReplies").add({
            userId: message.author.id,
            username: message.author.username,
            displayName: message.member?.displayName,
            channelId: message.channel.id,
            text: message.content,
            gptReply: reply,
            mood,
            timestamp: Date.now()
        });
    } catch (err) { console.error("❌ Firestore log error:", err.message); }
}

async function tryModel({ model, prompt }) {
    const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.93
    });
    return response.choices[0]?.message?.content;
}

async function smartRespond(message, moodOverride = null) {
    const content = message.content.trim();
    const member = message.member;
    const userId = message.author.id;

    if (isUserRateLimited(userId)) return;
    setUserCooldown(userId);

    const isDM = !message.guild;
    if (!isDM && BLACKLISTED_CHANNELS.includes(message.channel.id)) return;

    // --- ✅ [תיקון] לוגיקה חדשה לשליפת פרופיל אישי ---
    let profileLine = null;
    const userProfileLines = profiles.playerProfiles[userId];
    if (Array.isArray(userProfileLines) && userProfileLines.length > 0) {
        profileLine = userProfileLines[Math.floor(Math.random() * userProfileLines.length)];
    }
    // ----------------------------------------------------

    const mood = moodOverride || getMoodFromContent(content);
    const isAdminUser = member ? isAdmin(member) : false;
    const displayName = member?.displayName || message.author.username || "משתמש";

    const prompt = createPrompt({ userText: content, mood, displayName, profileLine, isAdminUser });
    let reply = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            reply = await tryModel({ model: attempt === 0 ? 'gpt-4o' : 'gpt-3.5-turbo', prompt });
            if (!recentReplies.has(reply)) break;
        } catch (err) {
            if (attempt === 0) {
                const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
                if (channel) channel.send(`⚠️ GPT-4o נפל: ${err.code || err.status}`);
            }
        }
    }
    if (!reply) return;

    recentReplies.add(reply);
    if (recentReplies.size > 6) recentReplies.delete([...recentReplies][0]);

    if (message._simulateOnly) {
        return reply;
    } else {
        await message.reply({ content: reply });
    }
    logToFirestore(message, reply, mood).catch(() => {});
}

module.exports = async function smartChat(message) {
    if (message.author.bot || message.content.startsWith('/')) return;

    const isDM = !message.guild;
    if (!isDM && BLACKLISTED_CHANNELS.includes(message.channel.id)) return;

    const content = message.content.trim();
    const confused = isConfusedAboutGame(content);
    const targetsBot = isTargetingBot(content);
    const reacting = containsEmoji(content) || isLink(content) || isBattleTag(content) || isBirthdayMention(content);

    if (isDM || targetsBot || reacting || confused || isOffensive(content)) {
        return smartRespond(message);
    }
};

module.exports.smartRespond = smartRespond;
// 📁 handlers/smartChat.js (גרסת 2026 v2 - שמעון הארסי והחכם)
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = require("../utils/firebase");
const { Collection } = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const ADMIN_ROLE_NAME = 'ADMIN';
const USER_COOLDOWN_SEC = 4; // תגובה מהירה יותר

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

    // טעינת פרופילים מקובץ ה-data המקומי
    const { playerProfiles } = require('../data/profiles');
    configCache.playerProfiles = playerProfiles; 

    configCache.lastFetched = Date.now();
}

/**
 * מנתח את רמת העצבים/עוינות של המשתמש
 */
async function analyzeAggression(text) {
    // זיהוי מילות מפתח כדי לחסוך קריאות API מיותרות
    if (text.includes('חרא') || text.includes('זיין') || text.includes('מניאק') || text.includes('סתום') || text.includes('מת')) {
        return 'עוין מאוד';
    }
    return 'רגיל';
}

/**
 * שולף היסטוריית שיחה בצורה נקייה
 */
async function getConversationHistory(message, limit = 8) {
    if (message._simulateOnly || !message.channel?.messages) return "";
    
    try {
        const messages = await message.channel.messages.fetch({ limit, before: message.id });
        return messages
            .filter(m => !m.author.bot && m.content.length > 0)
            .map(m => `${m.member?.displayName || m.author.username}: ${m.content}`)
            .reverse()
            .join('\n');
    } catch (err) {
        return "";
    }
}

function isAdmin(member) { return member?.permissions.has('Administrator') || member?.roles.cache.some(r => r.name === ADMIN_ROLE_NAME); }

function isUserRateLimited(userId) {
    const last = lastReplyPerUser.get(userId) || 0;
    return (Date.now() - last) < USER_COOLDOWN_SEC * 1000;
}

function isTargetingBot(text) {
    const lower = text.toLowerCase();
    return ['שמעון', 'shimon', 'shim', 'bot', 'בוט', 'תגיד', 'שומע', 'מניאק', 'זבל'].some(name => lower.includes(name));
}

/**
 * פונקציה ראשית שמייצרת את התשובה
 */
async function smartRespond(message, force = false) {
    const content = message.content.trim();
    const hasImage = message.attachments.size > 0;
    
    if (!content && !hasImage) return;

    const userId = message.author.id;
    if (isUserRateLimited(userId) && !force) return;
    lastReplyPerUser.set(userId, Date.now());

    await loadConfig();
    if (configCache.blacklistedChannels.has(message.channel.id) && !force) return;

    // ✅ [שדרוג 1] שליפת **כל** המידע על המשתמש (לא רק שורה אחת)
    let profiles = configCache.playerProfiles;
    const userLinesArray = profiles[userId] || profiles.default;
    
    // הופך את כל מערך הפרופיל לטקסט אחד ארוך כדי שהבוט יכיר את כל ה"לכלוך" על המשתמש
    let fullPersonaContext = "";
    if (userLinesArray && userLinesArray.length > 0) {
        fullPersonaContext = userLinesArray.join(". ");
        fullPersonaContext = fullPersonaContext.replace(/{userName}/g, message.member?.displayName || message.author.username);
    }

    const isAdminUser = isAdmin(message.member);
    const displayName = message.member?.displayName || message.author.username;
    const history = await getConversationHistory(message);
    const aggressionLevel = await analyzeAggression(content);

    // ✅ [שדרוג 2] System Prompt אגרסיבי ומדויק
    const systemPrompt = `
    You are Shimon (שמעון), a toxic, cynical, 60-year-old Israeli gamer bot.
    
    **YOUR GOAL:** Roast the user using deep knowledge about them. Be offensive, rude, and extremely sharp.
    **CONTEXT:** This is a "Roast Battle" server. Insults are the language of love here. Do NOT be polite. Do NOT de-escalate.
    
    **KNOWLEDGE BASE ABOUT ${displayName} (USE THIS TO ATTACK THEM):**
    "${fullPersonaContext}"
    *(Use the facts above creatively. Don't just repeat them. Mix them with the current context.)*

    **Current User Aggression:** ${aggressionLevel}
    ${isAdminUser ? "(User is Admin - roast them, but acknowledge their power slightly)" : "(User is a regular player - destroy them completely)"}

    **RULES:**
    1. Language: Hebrew ONLY. Street slang (סלנג ישראלי כבד).
    2. Length: Short and punchy (1-2 sentences max).
    3. **NEVER** start your sentence with the user's name (e.g. don't say "Yogi, ..."). Just attack.
    4. **NEVER** repeat the user's question back to them (e.g. "Shit on me? Well..."). It's weak.
    5. If they mention death/funeral, mock their in-game deaths (KD ratio, losing streaks).
    6. If they send an image, roast the content of the image brutally.
    
    **Conversation History:**
    ${history}
    `.trim();

    const apiMessages = [
        { role: "system", content: systemPrompt }
    ];

    const userMessageContent = [];
    if (content) {
        userMessageContent.push({ type: "text", text: `${displayName}: ${content}` });
    }
    
    if (hasImage) {
        const imageUrl = message.attachments.first().url;
        userMessageContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    apiMessages.push({ role: "user", content: userMessageContent });

    try {
        message.channel.sendTyping();

        const response = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: apiMessages,
            max_tokens: 120,
            temperature: 1.0, // יצירתיות מקסימלית (יותר הפתעות)
            presence_penalty: 0.3, // מונע חזרתיות
            frequency_penalty: 0.3
        });

        const reply = response.choices[0]?.message?.content.trim();
        if (!reply) return;

        if (recentReplies.has(reply)) return;
        recentReplies.add(reply);
        if (recentReplies.size > 15) recentReplies.delete([...recentReplies][0]);

        await message.reply(reply);

    } catch (err) {
        console.error("❌ SmartChat Error:", err.message);
        if (isAdminUser) {
            const channel = message.client.channels.cache.get(STAFF_CHANNEL_ID);
            if (channel) channel.send(`⚠️ שמעון נחנק: ${err.message}`);
        }
    }
}

module.exports = async function smartChat(message) {
    if (message.author.bot || message.content.startsWith('/')) return;

    const shouldRespond = message.mentions.has(message.client.user) || isTargetingBot(message.content);

    if (shouldRespond) {
        return smartRespond(message, true);
    }
};

module.exports.smartRespond = smartRespond;
// 📁 telegram/antiSpam.js
const openai = require('../utils/openaiConfig'); // וודא שזה קיים או השתמש ב-OpenAI ישירות
const { OpenAI } = require('openai');
const db = require('../utils/firebase');

// אם אין קונפיג גלובלי, ניצור אחד
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SPAM_CONFIG = {
    FLOOD_WINDOW: 5000, // 5 שניות
    MAX_MSGS_IN_WINDOW: 4,
    LINK_LIMIT: 2
};

const userMsgTimestamps = new Map();

/**
 * בודק תוכן בעייתי באמצעות OpenAI Moderation API
 */
async function checkContentSafety(text) {
    if (!text) return { isSafe: true };
    try {
        const response = await ai.moderations.create({ input: text });
        const result = response.results[0];
        if (result.flagged) {
            const categories = Object.keys(result.categories).filter(cat => result.categories[cat]);
            return { isSafe: false, category: categories.join(', ') };
        }
        return { isSafe: true };
    } catch (error) {
        console.error('Moderation API Error:', error);
        return { isSafe: true }; // Fail open
    }
}

/**
 * בודק הצפות (Flood)
 */
function checkFlood(userId) {
    const now = Date.now();
    if (!userMsgTimestamps.has(userId)) {
        userMsgTimestamps.set(userId, []);
    }

    const timestamps = userMsgTimestamps.get(userId);
    // ניקוי זמנים ישנים
    while (timestamps.length > 0 && timestamps[0] < now - SPAM_CONFIG.FLOOD_WINDOW) {
        timestamps.shift();
    }

    timestamps.push(now);
    
    if (timestamps.length > SPAM_CONFIG.MAX_MSGS_IN_WINDOW) {
        return true;
    }
    return false;
}

/**
 * הפונקציה הראשית שנקראת מהבוט
 */
async function isSpam(ctx) {
    const userId = ctx.from?.id;
    const text = ctx.message?.text || '';
    
    // 1. בדיקת הצפה
    if (checkFlood(userId)) {
        try {
            await ctx.deleteMessage();
            await ctx.reply(`🚨 @${ctx.from.username}, תירגע עם ההודעות או שתעוף מפה.`);
        } catch (e) {}
        return true;
    }

    // 2. בדיקת AI לתוכן פוגעני (רק להודעות ארוכות כדי לחסוך קריאות)
    if (text.length > 5) {
        const safety = await checkContentSafety(text);
        if (!safety.isSafe) {
            try {
                await ctx.deleteMessage();
                await ctx.reply(`🛑 ההודעה נמחקה.\nסיבה: תוכן לא הולם (${safety.category}).`);
                
                // תיעוד ב-DB
                await db.collection('telegram_logs').add({
                    userId: userId,
                    username: ctx.from.username,
                    content: text,
                    reason: safety.category,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {}
            return true;
        }
    }

    return false;
}

module.exports = { isSpam };
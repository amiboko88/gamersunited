// 📁 telegram/shimonSmart.js
const { OpenAI } = require('openai');
const db = require('../utils/firebase');
const { triggerWords } = require("./smartKeywords");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const lastSmartResponse = new Map();
const RATE_LIMIT = 10000; // 10 שניות קולדאון לצ'אט

/**
 * בונה פרומפט חכם עם הקשר למשתמש (אם קיים ב-DB)
 */
async function buildSystemPrompt(telegramUserId, senderName) {
    let context = "";
    
    // נסיון שליפת נתונים מה-DB המאוחד
    // מחפשים משתמש שיש לו את הטלגרם ID הזה
    try {
        const snapshot = await db.collection('users').where('platforms.telegram', '==', String(telegramUserId)).limit(1).get();
        if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            const facts = userData.brain?.facts || [];
            const roasts = userData.brain?.roasts || [];
            
            if (facts.length) context += `\nעובדה על המשתמש: ${facts[0].content}.`;
            if (roasts.length) context += `\nחומר ירידות עליו: "${roasts[0]}".`;
        }
    } catch (e) {}

    return `
    אתה שמעון. גיימר ישראלי, סרקסטי, וחסר סבלנות.
    אתה נמצא בצ'אט בטלגרם.
    המשתמש שמדבר איתך: ${senderName}.
    ${context}
    
    הנחיות:
    1. תענה קצר (עד 20 מילים).
    2. תהיה עוקצני ומצחיק.
    3. אל תהיה נחמד מדי.
    `;
}

async function handleSmartReply(ctx) {
    const text = ctx.message?.text;
    if (!text) return;

    const chatId = ctx.chat.id;
    const now = Date.now();
    const isDirectMention = text.includes('שמעון') || (ctx.message.reply_to_message?.from?.is_bot);

    // הגנה מפני ספאם של תשובות
    if (lastSmartResponse.has(chatId) && (now - lastSmartResponse.get(chatId) < RATE_LIMIT) && !isDirectMention) {
        return;
    }

    // בדיקה אם צריך לענות (מילת מפתח או תיוג)
    const shouldReply = isDirectMention || triggerWords.some(w => text.toLowerCase().includes(w));
    
    if (!shouldReply && Math.random() > 0.05) return; // 5% סיכוי לענות סתם ככה

    try {
        await ctx.replyWithChatAction('typing');
        
        const prompt = await buildSystemPrompt(ctx.from.id, ctx.from.first_name);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: text }
            ],
            temperature: 0.9,
            max_tokens: 100,
            presence_penalty: 0.3
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) {
            await ctx.reply(reply);
            lastSmartResponse.set(chatId, now);
        }

    } catch (error) {
        console.error('Shimon Telegram AI Error:', error);
    }
}

module.exports = handleSmartReply;
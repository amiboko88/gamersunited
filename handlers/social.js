// 📁 handlers/social.js
const { OpenAI } = require('openai');
const { getUserData } = require('../utils/userUtils'); // ✅
const memoryEngine = require('./memory');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// פונקציית עזר ליצירת הפרומפט למערכת (System Prompt)
function generateSystemPrompt(senderName, roastContext, mood, extraContext, balanceInfo) {
    return `
    אתה שמעון, בוט גיימרים ישראלי קשוח, סרקסטי וציני.
    אתה נמצא בקבוצת וואטסאפ/דיסקורד של חברים גיימרים.
    
    המשתמש שמדבר איתך: ${senderName}
    מידע מודיעיני עליו (לשימוש בירידות): ${roastContext}
    
    מצב רוח נוכחי: ${mood || 'רגיל (עוקצני)'}
    ${extraContext ? `הקשר נוסף: ${extraContext}` : ''}
    ${balanceInfo ? `מצב חשבון: ${balanceInfo}` : ''}
    
    הנחיות:
    1. תהיה קצר. אל תחפור.
    2. דבר בעברית סלנגית של גיימרים ("בוט", "נוב", "לאג", "פינג").
    3. אם יש לך מידע מודיעיני - תשתמש בו כדי לרדת עליו.
    4. אל תהיה נחמד מדי, אלא אם זה מצב "PRAISE".
    `;
}

// פונקציית הליבה ליצירת תשובת AI
async function generateAiReply(senderName, senderId, text, mood, sentiment, category, platform = 'whatsapp') {
    // שליפת המידע המאוחד על המשתמש
    const userData = await getUserData(senderId, platform);
    
    // שליפת רמה וכסף לצורך התייחסות
    const level = userData?.economy?.level || 1;
    const balance = userData?.economy?.balance || 0;
    
    // קבלת חומר לירידות
    const roastContext = await memoryEngine.getRoast(senderName, senderId, platform);

    const systemMsg = generateSystemPrompt(
        senderName, 
        roastContext, 
        mood, 
        `המשתמש בדרגה ${level}. סיווג הודעה: ${category}. סנטימנט: ${sentiment}.`, 
        `₪${balance}`
    );

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            temperature: 0.9,
            max_tokens: 150
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('AI Generation Error:', error);
        return "וואלה נשרף לי המעבד. נסה שוב.";
    }
}

/**
 * טיפול בפרופיל חכם
 */
async function handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName) {
    const userData = await getUserData(senderId, 'whatsapp');
    
    if (!userData) {
        await sock.sendMessage(chatJid, { text: "וואלה לא מכיר אותך עדיין. תכתוב משהו בקבוצה שנתעדכן." });
        return;
    }

    const { xp, level, balance } = userData.economy || { xp: 0, level: 1, balance: 0 };
    const { messagesSent, voiceMinutes } = userData.stats || { messagesSent: 0, voiceMinutes: 0 };

    const summary = `
    👤 *הפרופיל של ${senderName}*
    ⭐ רמה: ${level} (XP: ${Math.floor(xp)})
    💰 ארנק: ₪${balance.toLocaleString()}
    🎤 זמן דיבור: ${Math.floor(voiceMinutes / 60)} שעות
    💬 הודעות: ${messagesSent}
    `;

    await sock.sendMessage(chatJid, { text: summary }, { quoted: msg });
}

// ייצוא הפונקציות
module.exports = { 
    handleSmartProfileRequest,
    generateAiReply
};
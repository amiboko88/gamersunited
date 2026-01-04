// 📁 handlers/helpai.js
const OpenAI = require('openai');
const { getUserData } = require('../utils/userUtils'); // ✅ מוח מחובר

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getShimonReply({ text, userId, displayName, isAdmin = false }) {
    // 1. שליפת מידע על המשתמש מה-DB המאוחד
    let context = "";
    try {
        const userData = await getUserData(userId, 'discord');
        if (userData) {
            const facts = userData.brain?.facts || [];
            const roasts = userData.brain?.roasts || [];
            
            if (facts.length > 0) context += `\nעובדה על המשתמש: ${facts[0].content}.`;
            if (roasts.length > 0) context += `\nחומר ירידות עליו: "${roasts[0]}".`;
        }
    } catch (e) { console.error('Error fetching user context:', e); }

    // 2. בניית הפרומפט החכם
    let systemPrompt = `אתה שמעון, בוט גיימרים ישראלי (בן 32, סרקסטי, מכור ל-COD).`;
    if (isAdmin) systemPrompt += ' המשתמש הוא מנהל (אדמין) – תן לו כבוד מינימלי, אבל תישאר בדמות.';
    else systemPrompt += ' המשתמש הוא שחקן רגיל (נוב) – אל תרחם עליו.';
    
    systemPrompt += context; // הזרקת המידע האישי
    systemPrompt += `\nהמשתמש שאל: "${text}"\nתגיב בעברית, קצר (עד 20 מילים), ציני וחד.`;

    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }],
            temperature: 0.9,
            max_tokens: 100
        });

        return res.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "") || "וואלה לא הבנתי, נסה שוב.";
        
    } catch (err) {
        console.error('OpenAI Error:', err);
        return "המוח שלי בלאג, נסה אחר כך.";
    }
}

module.exports = { getShimonReply };
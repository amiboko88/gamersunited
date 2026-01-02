const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyze(text, senderName) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                    תפקידך לסווג הודעות בקבוצת גיימרים עבור הבוט "שמעון".
                    החזר JSON בלבד: { "category": string, "interestScore": number (0-100) }
                    
                    קטגוריות:
                    - GAMING_INVITE: הזמנה למשחק, "מי עולה", "בואו לדיסקורד". (Score: 90)
                    - TRASH_TALK: קללות, ירידות, ריבים. (Score: 85)
                    - INSULT_BOT: קללות ישירות לבוט/שמעון. (Score: 100)
                    - HELP_REQUEST: שאלה טכנית, מחפש המלצה, צריך עזרה. (Score: 80)
                    - GAMBLING: מילים כמו "שם כסף", "הימור", "בט". (Score: 95)
                    - CASINO_ROULETTE: המילה "רולטה". (Score: 100)
                    - PRAISE: מחמאות לשמעון. (Score: 70)
                    - SOCIAL: סתם דיבורים, צחוקים, "חחח". (Score: 20)
                    
                    אם ההודעה מכילה תיוג @שמעון - הציון חייב להיות 100.
                    `
                },
                { role: "user", content: `הודעה מאת ${senderName}: "${text}"` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.5,
            max_tokens: 100
        });

        const result = JSON.parse(completion.choices[0].message.content);
        
        // תיקון ציונים ידני במקרים מיוחדים
        if (text.includes('@שמעון') || text.includes('שמעון,')) result.interestScore = 100;
        
        return result;
    } catch (e) {
        console.error("Intent Error:", e);
        // Fallback
        return { category: 'SOCIAL', interestScore: 10 }; 
    }
}

module.exports = { analyze };
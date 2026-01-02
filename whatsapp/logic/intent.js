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
                    תפקידך לסווג הודעות עבור הבוט "שמעון".
                    החזר JSON בלבד: { 
                        "category": string, 
                        "interestScore": number (0-100),
                        "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" 
                    }
                    
                    קטגוריות:
                    - PROFILE: שאלות על כסף, דרגה, XP, "כמה יש לי", "תראה ארנק". (Score: 100)
                    - GAMING_INVITE: הזמנה למשחק, "מי עולה", "בואו לדיסקורד". (Score: 90)
                    - TRASH_TALK: ירידות, צחוקים גסים, קללות הדדיות. (Score: 85)
                    - INSULT_BOT: קללות המכוונות ספציפית לשמעון/לבוט. (Score: 100)
                    - HELP_REQUEST: שאלה טכנית, מחפש המלצה, צריך עזרה. (Score: 80)
                    - GAMBLING: מילים כמו "שם כסף", "הימור", "בט". (Score: 95)
                    - CASINO_ROULETTE: המילה "רולטה". (Score: 100)
                    - PRAISE: מחמאות לשמעון ("שמעון יא מלך"). (Score: 70)
                    - SOCIAL: סתם דיבורים, שאלות כלליות ("מה קורה?"), "חחח". (Score: 20)
                    
                    SENTIMENT GUIDELINES:
                    - שאלה מנומסת/ניטרלית -> NEUTRAL
                    - מחמאה/אהבה -> POSITIVE
                    - קללה/עצבים -> NEGATIVE
                    `
                },
                { role: "user", content: `הודעה מאת ${senderName}: "${text}"` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.5,
            max_tokens: 120
        });

        const result = JSON.parse(completion.choices[0].message.content);
        if (text.includes('@שמעון') || text.includes('שמעון,')) result.interestScore = 100;
        return result;
    } catch (e) {
        console.error("Intent Error:", e);
        return { category: 'SOCIAL', interestScore: 10, sentiment: 'NEUTRAL' }; 
    }
}

module.exports = { analyze };
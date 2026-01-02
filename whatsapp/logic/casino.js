const { placeBet, startCasinoSession } = require('../handlers/casinoHandler'); // הנדלר טכני
const { generateSystemPrompt } = require('../persona'); // האישיות
const memoryEngine = require('./memory');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleBetRequest(sock, chatJid, senderId, senderName, text) {
    // מנסים להמר
    const result = await placeBet(senderId, senderName, text);
    
    // שליפת מידע לסגנון דיבור
    const roast = await memoryEngine.getRoast(senderName, senderId);
    let systemMsg = "";

    // המרת התוצאה הטכנית לתגובה עם אישיות
    switch (result.status) {
        case 'closed':
            systemMsg = generateSystemPrompt(senderName, roast, "", "המשתמש מנסה להמר כשהקזינו סגור. תעיף אותו לישון.", "");
            break;
        case 'broke':
            systemMsg = generateSystemPrompt(senderName, roast, "", `המשתמש מרושש. נתת לו הלוואה של ${result.loanAmount}. תרד עליו שהוא נזקק.`, "");
            break;
        case 'insufficient_funds':
            systemMsg = generateSystemPrompt(senderName, roast, "", `אין לו מספיק כסף (יש לו רק ${result.currentBalance}). תצחק עליו.`, "");
            break;
        case 'success':
            systemMsg = generateSystemPrompt(senderName, roast, "", `הוא הימר ${result.amount} על "${result.target}". תאחל לו בהצלחה (או כישלון).`, `יתרה נוכחית: ${result.newBalance}`);
            // אם זו הפעם הראשונה, אולי נפתח את הסשן רשמית
            startCasinoSession();
            break;
        default:
            return; // התעלמות אם לא זוהה
    }

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemMsg }],
        max_tokens: 60
    });

    await sock.sendMessage(chatJid, { text: completion.choices[0].message.content });
}

module.exports = { handleBetRequest };
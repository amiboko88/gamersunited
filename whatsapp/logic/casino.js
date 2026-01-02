const { placeBet, startCasinoSession } = require('../handlers/casinoHandler');
const { generateSystemPrompt } = require('../persona');
const memoryEngine = require('./memory');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


async function handleBetRequest(sock, chatJid, senderId, senderName, text) {
    // זיהוי שאלות אינפורמטיביות על הקזינו
    if (text.includes('מתי') && (text.includes('נפתח') || text.includes('נסגר'))) {
        const reply = "הקזינו פתוח 24/7 יא אח. כל עוד יש לך כסף בארנק - אתה יכול להמר. יאללה תן בראש.";
        await sock.sendMessage(chatJid, { text: reply });
        return;
    }

    const isQuestion = text.includes('?') || text.includes('אפשר') || text.includes('יכול');
    const result = await placeBet(senderId, senderName, text);
    const roast = await memoryEngine.getRoast(senderName, senderId);
    let systemMsg = "";

    switch (result.status) {
        case 'closed':
            systemMsg = generateSystemPrompt(senderName, roast, "", "המשתמש מנסה להמר כשהקזינו סגור (נדיר). תגיד לו לחכות.", "");
            break;
        case 'broke':
            // כאן נהיה עדינים יותר אם זו הייתה שאלה
            systemMsg = generateSystemPrompt(senderName, roast, "", 
                `הוא רוצה להמר אבל אין לו שקל. נתת לו הלוואה של ${result.loanAmount}. תגיד לו: "וואלה אחי אתה מרושש, קח הלוואה עליי ותתחיל לעבוד".`, ""
            );
            break;
        case 'insufficient_funds':
             systemMsg = generateSystemPrompt(senderName, roast, "", 
                `הוא מנסה להמר סכום שאין לו (יש לו ${result.currentBalance}). תגיד לו בעדינות: "נשמה, אין לך כיסוי לזה. תוריד סכום."`, ""
            );
            break;
        case 'invalid':
            if (isQuestion) {
                 systemMsg = generateSystemPrompt(senderName, roast, "", 
                    `הוא שואל איך להמר ("${text}"). תסביר לו בקצרה: "פשוט תכתוב 'שם 100 על יוגי'. קליל."`, ""
                );
            } else {
                return; 
            }
            break;
        case 'success':
            if (isQuestion) {
                 systemMsg = generateSystemPrompt(senderName, roast, "", 
                    `הוא שאל אם אפשר, אז זרמת איתו ושמת את ההימור (${result.amount} על ${result.target}). תגיד לו: "אפשרי ועוד איך. רשמתי. בהצלחה!"`, 
                    `יתרה: ${result.newBalance}`
                );
            } else {
                systemMsg = generateSystemPrompt(senderName, roast, "", 
                    `הימור נקלט: ${result.amount} על ${result.target}. תפרגן לו.`, 
                    `יתרה: ${result.newBalance}`
                );
            }
            startCasinoSession();
            break;
    }

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemMsg }],
        max_tokens: 100,
        temperature: 0.7 
    });

    await sock.sendMessage(chatJid, { text: completion.choices[0].message.content });
}

module.exports = { handleBetRequest };
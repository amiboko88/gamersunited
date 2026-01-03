// 📁 whatsapp/logic/gamers.js
const { analyzeImage, shouldCheckImage } = require('../handlers/visionHandler');
const memoryEngine = require('../../handlers/memory'); // ✅ תוקן: הפנייה למוח הראשי
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function processImage(sock, msg, chatJid, senderId, senderName) {
    const text = msg.message.imageMessage.caption || "";
    const checkData = shouldCheckImage(senderId, text);

    // אם זה לא לוח תוצאות ולא קשור לדמג' - מדלגים (חוסכים כסף)
    if (!checkData.check) return;

    // בניית הפרומפט ל-Vision
    // שולפים מידע מהזיכרון המאוחד כדי שהירידה תהיה אישית
    const roast = await memoryEngine.getRoast(senderName, senderId, 'whatsapp');
    let visionPrompt = "";

    if (checkData.claimData) {
        visionPrompt = `אתה שמעון. ${senderName} טוען שעשה ${checkData.claimData.claimedDmg} דמג'. תבדוק בלוח שבתמונה. אם הוא משקר - צא עליו. אם צדק - תפרגן בקושי. מידע אישי עליו: ${roast}`;
    } else {
        visionPrompt = `אתה שמעון. נתח את הלוח תוצאות שבתמונה. רד על מי ששיחק גרוע (Damage נמוך) ופרגן למי שהפציץ. השתמש במידע אישי: ${roast}`;
    }

    // שליחה לניתוח
    const aiAnalysis = await analyzeImage(sock, msg, visionPrompt);
    
    if (aiAnalysis) {
        await sock.sendMessage(chatJid, { text: aiAnalysis }, { quoted: msg });
    }
}

module.exports = { processImage };
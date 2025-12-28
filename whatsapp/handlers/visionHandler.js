const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// תור האימות (נשמר בזיכרון של הקובץ הזה)
const verificationQueue = new Map();

// הוספת משתמש לרשימת ההמתנה לאימות
function addClaimToQueue(senderId, damageAmount) {
    verificationQueue.set(senderId, { claimedDmg: damageAmount, timestamp: Date.now() });
    log(`[Vision] 📝 User ${senderId} claims ${damageAmount} DMG. Waiting for proof...`);
}

async function handleImageAnalysis(sock, msg, chatJid, senderId, senderName) {
    if (!msg.message.imageMessage) return false;

    // האם יש תביעה פתוחה?
    const pendingClaim = verificationQueue.get(senderId);
    const hasClaim = pendingClaim && (Date.now() - pendingClaim.timestamp < 300000); // 5 דקות

    log(`[Vision] 📷 Analyzing image from ${senderName}... Has Claim? ${hasClaim}`);
    
    try {
        const buffer = await downloadMediaMessage(
            msg, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
        );
        const base64Image = buffer.toString('base64');

        let promptText = "אתה שמעון. תסתכל על לוח התוצאות (Scoreboard) של Warzone.";
        
        if (hasClaim) {
            promptText += `\nהמשתמש הזה טוען שהוא עשה ${pendingClaim.claimedDmg} דמג'.\n` +
                          "תפקידך לאמת את זה:\n" +
                          "1. אם המספר בתמונה קרוב (סטייה עד 150) -> תאשר ותרד עליו בקטנה.\n" +
                          "2. אם המספר נמוך משמעותית -> צא עליו שהוא שקרן.\n" +
                          "3. אם המספר גבוה יותר -> תפרגן.\n" +
                          "תחזיר תשובה קצרה וחותכת.";
        } else {
            promptText += "\nתחלץ את הדמג' וההריגות של השחקנים הבולטים ותרד עליהם.";
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [
                { role: "system", content: promptText },
                { role: "user", content: [
                    { type: "text", text: "הנה התמונה. דבר אליי." },
                    { type: "image_url", image_url: { "url": `data:image/jpeg;base64,${base64Image}` } }
                ]}
            ],
            max_tokens: 250
        });

        const analysis = response.choices[0].message.content;
        
        if (hasClaim) verificationQueue.delete(senderId); // מנקים מהתור

        await sock.sendMessage(chatJid, { text: analysis }, { quoted: msg });
        return true; 

    } catch (error) {
        console.error("Vision Error:", error);
        return false;
    }
}

// פונקציית עזר לבדיקה האם צריך להפעיל את ה-Vision
function shouldCheckImage(senderId, caption) {
    return verificationQueue.has(senderId) || caption.includes('לוח') || caption.includes('דמג');
}

module.exports = { handleImageAnalysis, addClaimToQueue, shouldCheckImage };
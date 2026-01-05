// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent');
const bufferSystem = require('./buffer');
const casinoHandler = require('../handlers/casinoHandler');
// ✅ חיבור למוח הגלובלי המאוחד
const socialEngine = require('../../handlers/social'); 

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // חיווי הקלדה - נותן תחושה אנושית
    await sock.sendPresenceUpdate('composing', chatJid);

    // שליחה לבאפר (שכבת ההגנה מפני ספאם + איחוד הודעות)
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    // 1. טיפול בחוסמי ספאם (מגיע מה-Buffer)
    if (text === "BLOCKED_SPAM") {
        // שמעון משתיק אותו חד פעמית
        await sock.sendMessage(chatJid, { text: `🚨 ${senderName}, סתום ת'פה לדקה. חפרת.` }, { quoted: msg });
        return;
    }

    try {
        // Fast Path - מסלול מהיר לקזינו (חוסך כסף וזמן AI)
        // בודק מילות מפתח לפני שפונים ל-OpenAI
        if (text.includes('רולטה') || text.includes('הימור') || text.includes('בט')) {
            const betResult = await casinoHandler.placeBet(senderId, senderName, text);
            
            // טיפול בתשובות הקזינו
            if (betResult.status === 'success') {
                let caption = betResult.result === 'WIN' 
                    ? `🤑 **יש זכייה!**\nלקחת ${betResult.amount * 2} שקל.` 
                    : `📉 **הלך הכסף...**\nהפסדת ${betResult.amount}. לא נורא, תהמר שוב.`;
                
                caption += `\n💰 יתרה: ₪${betResult.newBalance}`;

                // שליחת הגיף/סטיקר + טקסט
                if (betResult.asset && betResult.asset.endsWith('.mp4')) {
                    await sock.sendMessage(chatJid, { video: { url: betResult.asset }, caption, gifPlayback: true });
                } else if (betResult.asset) {
                    await sock.sendMessage(chatJid, { text: caption });
                    await sock.sendMessage(chatJid, { sticker: { url: betResult.asset } });
                } else {
                    await sock.sendMessage(chatJid, { text: caption });
                }
            } else if (betResult.status === 'broke') {
                await sock.sendMessage(chatJid, { text: `💸 אין לך שקל. קיבלת הלוואה של ${betResult.loanAmount} מהשוק האפור.` });
            } else if (betResult.status === 'insufficient_funds') {
                await sock.sendMessage(chatJid, { text: `🛑 אין כיסוי. יש לך רק ₪${betResult.currentBalance}.` });
            }
            return;
        }

        // 2. בדיקת כוונות (Intent)
        const intentData = await intentAnalyzer.analyze(text, senderName);

        // אם הציון נמוך והבוט לא תוייג - מתעלמים (חוסך כסף)
        const botId = sock.user.id.split(':')[0];
        const isMentioned = text.includes('@') || text.includes('שמעון') || msg.message.extendedTextMessage?.contextInfo?.participant?.includes(botId);
        
        if (intentData.interestScore < 90 && !isMentioned) {
             // אופציונלי: כאן המקום ללמוד (Memory Learn) גם כשלא עונים
            return;
        }

        // 3. יצירת תשובה דרך המנוע הגלובלי (Social Engine)
        // שים לב: אנחנו לא שולחים את ה-Roast, המנוע שואב אותו לבד מ-UserUtils!
        const reply = await socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer",   // Mood
            intentData.sentiment, 
            intentData.category, 
            'whatsapp'           // Platform
        );

        await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });

    } catch (error) {
        console.error('❌ [Core] Error:', error);
    }
}

module.exports = { handleMessageLogic };
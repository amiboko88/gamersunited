// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent');
const bufferSystem = require('./buffer');
const casinoHandler = require('../handlers/casinoHandler');
const socialEngine = require('../../handlers/social'); 
const mediaGenerator = require('./mediaGenerator'); // ✅ המודול הויזואלי החדש

/**
 * נקודת הכניסה הראשית להודעות (Entry Point)
 * כל הודעה עוברת קודם כל דרך הבאפר לסינון ספאם ואיחוד הודעות.
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // חיווי הקלדה - נותן תחושה אנושית ומרמז ששמעון "חושב"
    await sock.sendPresenceUpdate('composing', chatJid);

    // שליחה לבאפר (שכבת ההגנה מפני ספאם + איחוד הודעות)
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

/**
 * המוח המרכזי - רץ רק אחרי שהבאפר אישר את ההודעה.
 */
async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    // 1. 🛡️ טיפול בחוסמי ספאם (מגיע מה-Buffer)
    if (text === "BLOCKED_SPAM") {
        await sock.sendMessage(chatJid, { text: `🚨 ${senderName}, סתום ת'פה לדקה. חפרת.` }, { quoted: msg });
        return;
    }

    try {
        // 2. ⚡ Fast Path - מסלול מהיר לקזינו (חוסך כסף וזמן AI)
        // בודק מילות מפתח לפני שפונים ל-OpenAI לניתוח כוונות
        if (text.includes('רולטה') || text.includes('הימור') || text.includes('בט')) {
            const betResult = await casinoHandler.placeBet(senderId, senderName, text);
            
            if (betResult.status === 'success') {
                let caption = betResult.result === 'WIN' 
                    ? `🤑 **יש זכייה!**\nלקחת ${betResult.amount * 2} שקל.` 
                    : `📉 **הלך הכסף...**\nהפסדת ${betResult.amount}. לא נורא, תהמר שוב.`;
                
                caption += `\n💰 יתרה: ₪${betResult.newBalance}`;

                // אם יש נכס ויזואלי מהקזינו (גיף/סטיקר), נשלח אותו
                if (betResult.asset) {
                    if (betResult.asset.endsWith('.mp4')) {
                        await sock.sendMessage(chatJid, { video: { url: betResult.asset }, caption, gifPlayback: true });
                    } else {
                        await sock.sendMessage(chatJid, { text: caption });
                        await sock.sendMessage(chatJid, { sticker: { url: betResult.asset } });
                    }
                } else {
                    await sock.sendMessage(chatJid, { text: caption });
                }
            } else if (betResult.status === 'broke') {
                await sock.sendMessage(chatJid, { text: `💸 אין לך שקל. קיבלת הלוואה של ${betResult.loanAmount} מהשוק האפור.` });
            } else if (betResult.status === 'insufficient_funds') {
                await sock.sendMessage(chatJid, { text: `🛑 אין כיסוי. יש לך רק ₪${betResult.currentBalance}.` });
            }
            // סיימנו טיפול בקזינו - לא ממשיכים ל-AI
            return;
        }

        // 3. 🧠 בדיקת כוונות (Intent Analysis)
        const intentData = await intentAnalyzer.analyze(text, senderName);

        // סינון רעשים: אם הציון נמוך והבוט לא תוייג - מתעלמים (חוסך כסף)
        const botId = sock.user.id.split(':')[0];
        const isMentioned = text.includes('@') || text.includes('שמעון') || msg.message.extendedTextMessage?.contextInfo?.participant?.includes(botId);
        
        if (intentData.interestScore < 90 && !isMentioned) {
            return;
        }

        // 4. 🎨 הבמאי הויזואלי (Visual Director)
        // אנחנו שולחים את זה ל-Media Generator שיחליט בעצמו אם לייצר תמונה
        // אם הוא מחזיר אובייקט, סימן שהוא החליט שכן
        const dynamicMedia = await mediaGenerator.generateContextualMedia(sock, senderId, senderName, null, intentData, text);
        
        if (dynamicMedia && dynamicMedia.url) {
            // שליחת התמונה שנוצרה ב-AI
            await sock.sendMessage(chatJid, { 
                image: { url: dynamicMedia.url }, 
                caption: dynamicMedia.caption 
            }, { quoted: msg });
        }

        // 5. 💬 יצירת תשובה טקסטואלית (Social Engine)
        // שולחים את הטקסט בכל מקרה (גם אם הייתה תמונה) כדי לשמור על רצף שיחה
        const reply = await socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer",   
            intentData.sentiment, 
            intentData.category, 
            'whatsapp'
        );

        await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });

    } catch (error) {
        console.error('❌ [Core] Fatal Error:', error);
    }
}

module.exports = { handleMessageLogic };
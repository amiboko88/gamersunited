// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent');
const bufferSystem = require('./buffer');
const casinoHandler = require('../handlers/casinoHandler');
const rouletteHandler = require('../handlers/rouletteHandler');
const socialEngine = require('../../handlers/social'); 
const mediaGenerator = require('./mediaGenerator'); 
const gamersEngine = require('./gamers'); 

async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // ❌ הסרנו מכאן את ה"מקליד" כדי למנוע מצב שהוא מקליד ולא עונה
    
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    // 1. חסימת ספאם
    if (text === "BLOCKED_SPAM") {
        await sock.sendMessage(chatJid, { text: `🚨 ${senderName}, סתום ת'פה לדקה. חפרת.` }, { quoted: msg });
        return;
    }

    try {
        // 2. Fast Path - משחקים (ללא AI וללא השהיה)
        if (text.includes('רולטה')) {
            await rouletteHandler.handleShimonRoulette(sock, chatJid);
            return;
        }

        if (text.includes('הימור') || text.includes('בט') || (text.includes('שם') && text.match(/\d+/))) {
            const betResult = await casinoHandler.placeBet(senderId, senderName, text);
            // ... (לוגיקת קזינו קיימת) ...
            if (betResult.status === 'success') {
                let caption = betResult.result === 'WIN' 
                    ? `🤑 **יש זכייה!**\nלקחת ${betResult.amount * 2} שקל.` 
                    : `📉 **הלך הכסף...**\nהפסדת ${betResult.amount}.`;
                caption += `\n💰 יתרה: ₪${betResult.newBalance}`;
                
                if (betResult.asset) {
                    const msgContent = betResult.asset.endsWith('.mp4') 
                        ? { video: { url: betResult.asset }, caption, gifPlayback: true }
                        : { image: { url: betResult.asset }, caption };
                    await sock.sendMessage(chatJid, msgContent);
                } else {
                    await sock.sendMessage(chatJid, { text: caption });
                }
            } else if (betResult.status === 'broke') {
                await sock.sendMessage(chatJid, { text: `💸 אין לך שקל. קח הלוואה.` });
            }
            return; 
        }

        // Vision AI
        if (mediaMsg && (text.includes('דמג') || text.includes('לוח') || text.includes('סקור'))) {
            await gamersEngine.processImage(sock, mediaMsg, chatJid, senderId, senderName);
            return;
        }

        // 3. 🧠 Intent Analysis
        const intentData = await intentAnalyzer.analyze(text, senderName);

        // ✅ לוג משוחזר: מציג את הכוונה והציון
        log(`[Core] 🧠 Intent: ${intentData.category} (${intentData.interestScore}) | Sentiment: ${intentData.sentiment}`);

        const botId = sock.user.id.split(':')[0];
        const isMentioned = text.includes('@') || text.includes('שמעון') || msg.message.extendedTextMessage?.contextInfo?.participant?.includes(botId);
        
        // סינון הודעות לא מעניינות ("שששש")
        if (intentData.interestScore < 85 && !isMentioned) {
            log(`[Core] 💤 Ignoring low interest message.`);
            return; // 🛑 כאן אנחנו יוצאים *לפני* ששלחנו "מקליד", אז לא תהיה הקלדת רפאים
        }

        // 4. ✅ עכשיו החלטנו לענות - נפעיל "מקליד"
        await sock.sendPresenceUpdate('composing', chatJid);

        // 5. ביצוע מקבילי (טקסט + תמונה)
        const textPromise = socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer",   
            intentData.sentiment, 
            intentData.category, 
            'whatsapp'
        );

        const imagePromise = mediaGenerator.generateContextualMedia(
            sock, senderId, senderName, null, intentData, text
        );

        // שליחת טקסט
        const replyText = await textPromise;
        if (replyText) {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }

        // שליחת תמונה (אם יש)
        const dynamicMedia = await imagePromise;
        if (dynamicMedia && dynamicMedia.url) {
            await sock.sendMessage(chatJid, { 
                image: { url: dynamicMedia.url }, 
                caption: dynamicMedia.caption 
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('❌ [Core] Fatal Error:', error);
    }
}

module.exports = { handleMessageLogic };
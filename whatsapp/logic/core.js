// 📁 whatsapp/logic/core.js
const { log } = require('../../utils/logger');
const intentAnalyzer = require('./intent');
const bufferSystem = require('./buffer');
const casinoHandler = require('../handlers/casinoHandler');
const rouletteHandler = require('../handlers/rouletteHandler');
const socialEngine = require('../../handlers/social'); 
const mediaGenerator = require('./mediaGenerator'); 
const gamersEngine = require('./gamers'); 

/**
 * נקודת הכניסה הראשית להודעות
 */
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderId = senderFullJid.split('@')[0];

    // חיווי הקלדה מיידי - נותן תחושה חיה
    await sock.sendPresenceUpdate('composing', chatJid);

    // שליחה לבאפר
    bufferSystem.addToBuffer(senderId, msg, text, (finalMsg, combinedText, mediaMsg) => {
        executeCoreLogic(sock, finalMsg, combinedText, mediaMsg, senderId);
    });
}

/**
 * המוח המרכזי - רץ במקביל למהירות מקסימלית
 */
async function executeCoreLogic(sock, msg, text, mediaMsg, senderId) {
    const chatJid = msg.key.remoteJid;
    const senderName = msg.pushName || "גיימר";

    // 1. הגנה מספאם
    if (text === "BLOCKED_SPAM") {
        await sock.sendMessage(chatJid, { text: `🚨 ${senderName}, סתום ת'פה לדקה. חפרת.` }, { quoted: msg });
        return;
    }

    try {
        // --- 2. מסלול מהיר (Fast Path) - ללא AI וללא המתנה ---
        
        // א. רולטה
        if (text.includes('רולטה')) {
            await rouletteHandler.handleShimonRoulette(sock, chatJid);
            return;
        }

        // ב. הימורים
        if (text.includes('הימור') || text.includes('בט') || (text.includes('שם') && text.match(/\d+/))) {
            const betResult = await casinoHandler.placeBet(senderId, senderName, text);
            
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
            } else if (betResult.status === 'insufficient_funds') {
                await sock.sendMessage(chatJid, { text: `🛑 אין כיסוי. יש לך רק ₪${betResult.currentBalance}.` });
            }
            return; 
        }

        // ג. ניתוח תמונה (Vision)
        if (mediaMsg && (text.includes('דמג') || text.includes('לוח') || text.includes('סקור'))) {
            await gamersEngine.processImage(sock, mediaMsg, chatJid, senderId, senderName);
            return;
        }

        // --- 3. ניתוח כוונות (Intent) ---
        const intentData = await intentAnalyzer.analyze(text, senderName);

        const botId = sock.user.id.split(':')[0];
        const isMentioned = text.includes('@') || text.includes('שמעון') || msg.message.extendedTextMessage?.contextInfo?.participant?.includes(botId);
        
        if (intentData.interestScore < 85 && !isMentioned) {
            return;
        }

        // --- 4. 🚀 ביצוע מקבילי (Parallel Execution) ---
        // הטריק למהירות: מריצים את שתי המשימות (טקסט ותמונה) ביחד!

        // משימה א' (טקסט):
        const textPromise = socialEngine.generateAiReply(
            senderName,
            senderId,
            text,
            "Sarcastic Gamer",   
            intentData.sentiment, 
            intentData.category, 
            'whatsapp'
        );

        // משימה ב' (תמונה - הבמאי הויזואלי):
        // מעבירים null כ-senderNameEng כי הלוגיקה החדשה מטפלת בזה בפנים
        const imagePromise = mediaGenerator.generateContextualMedia(
            sock, senderId, senderName, null, intentData, text
        );

        // --- 5. שליחה חכמה (מי שמוכן קודם נשלח) ---

        // הטקסט בדרך כלל מוכן ראשון - נשלח אותו מיד!
        const replyText = await textPromise;
        if (replyText) {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }

        // התמונה לוקחת יותר זמן - נחכה לה ברקע ונשלח כשהיא מוכנה
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
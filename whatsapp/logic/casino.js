// 📁 whatsapp/logic/casino.js
const { startCasinoSession } = require('../handlers/casinoHandler'); // שים לב לנתיב
const { generateAiReply } = require('../../handlers/social'); // שימוש במוח הראשי לתשובות
const { getUserData, getUserRef } = require('../../utils/userUtils'); // ✅ DB מאוחד
const admin = require('firebase-admin');

/**
 * מטפל בבקשות הימורים מהצ'אט
 */
async function handleBetRequest(sock, chatJid, senderId, senderName, text) {
    
    // שליפת נתונים
    const userData = await getUserData(senderId, 'whatsapp');
    const balance = userData?.economy?.balance || 0;

    // חילוץ סכום ודמות (לוגיקה פשוטה)
    const amountMatch = text.match(/(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[0]) : 0;
    
    // בדיקות בסיסיות
    if (amount <= 0) {
        const reply = await generateAiReply(senderName, senderId, text, "Sarcastic", "NEUTRAL", "GAMBLING", 'whatsapp');
        await sock.sendMessage(chatJid, { text: reply });
        return;
    }

    if (amount > balance) {
        await sock.sendMessage(chatJid, { text: `⚠️ יא חי בסרט, יש לך רק ₪${balance}. תרגיע.` });
        return;
    }

    // ביצוע ההימור (עדכון DB)
    const userRef = await getUserRef(senderId, 'whatsapp');
    await userRef.update({
        'economy.balance': admin.firestore.FieldValue.increment(-amount)
    });

    // תשובה חכמה
    const reply = await generateAiReply(
        senderName, 
        senderId, 
        `הימרתי ${amount} על ניצחון. תאשר לי.`, 
        "Casino Dealer", 
        "POSITIVE", 
        "GAMBLING", 
        'whatsapp'
    );

    await sock.sendMessage(chatJid, { text: `🎲 **הימור נקלט!**\n${reply}\nיתרה עדכנית: ₪${balance - amount}` });
    
    // הפעלת סשן (אם צריך)
    // startCasinoSession(...); 
}

module.exports = { handleBetRequest };
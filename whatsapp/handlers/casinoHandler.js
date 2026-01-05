// 📁 whatsapp/handlers/casinoHandler.js
const admin = require('firebase-admin');
const { getUserRef, getUserData } = require('../../utils/userUtils'); // ✅ שימוש בתשתית המאוחדת
const path = require('path');

// נכסים ויזואליים
const CASINO_ASSETS = {
    winGif: 'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4',
    loseGif: 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
    sticker: path.join(__dirname, '../../assets/logowa.webp')
};

/**
 * מבצע הימור מלא (כולל סליקה ותוצאה)
 */
async function placeBet(senderId, senderName, text) {
    // 1. חילוץ סכום (פשוט ויעיל)
    const amountMatch = text.match(/(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[0]) : 0;

    if (amount <= 0) return { status: 'invalid' };

    // 2. בדיקת יתרה דרך המערכת המאוחדת
    // שים לב: אנחנו מעבירים 'whatsapp' כפלטפורמה, וה-utils יודע למצוא את המשתמש הראשי
    const userData = await getUserData(senderId, 'whatsapp');
    const balance = userData?.economy?.balance || 0;

    // הלוואה אוטומטית (אם היתרה 0 או שלילית)
    if (balance <= 0) {
        const LOAN = 100;
        const userRef = await getUserRef(senderId, 'whatsapp');
        await userRef.update({ 
            'economy.balance': admin.firestore.FieldValue.increment(LOAN) 
        });
        return { status: 'broke', loanAmount: LOAN };
    }

    if (balance < amount) {
        return { status: 'insufficient_funds', currentBalance: balance };
    }

    // 3. ביצוע ההימור (הורדת הכסף מיידית)
    const userRef = await getUserRef(senderId, 'whatsapp');
    await userRef.update({
        'economy.balance': admin.firestore.FieldValue.increment(-amount)
    });

    // 4. הגרלת תוצאה (RNG)
    // סיכוי של 48% לזכות (לטובת הבית)
    const isWin = Math.random() < 0.48;
    
    // 5. עדכון זכייה וסטטיסטיקה
    const updatePayload = {
        'stats.casinoWins': admin.firestore.FieldValue.increment(isWin ? 1 : 0),
        'stats.casinoLosses': admin.firestore.FieldValue.increment(isWin ? 0 : 1)
    };

    if (isWin) {
        // מחזירים את ההימור + הזכייה
        updatePayload['economy.balance'] = admin.firestore.FieldValue.increment(amount * 2);
    }

    await userRef.update(updatePayload);

    // חישוב יתרה חדשה לתצוגה
    const newBalance = isWin ? (balance + amount) : (balance - amount);

    return {
        status: 'success',
        result: isWin ? 'WIN' : 'LOSS',
        amount: amount,
        newBalance: newBalance,
        asset: isWin ? CASINO_ASSETS.winGif : CASINO_ASSETS.loseGif
    };
}

module.exports = { placeBet };
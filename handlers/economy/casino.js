// 📁 handlers/economy/casino.js
const admin = require('firebase-admin');
const { ensureUserExists } = require('../../utils/userUtils');
const path = require('path');

const CASINO_ASSETS = {
    winGif: 'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4',
    loseGif: 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
    sticker: path.join(__dirname, '../../assets/logowa.webp')
};

class CasinoSystem {
    constructor() {
        this.activeSession = { isActive: false, startTime: 0, players: [], bets: [] };
        this.sessionTimer = null;
    }

    /**
     * מבצע הימור (פונקציה אונברסלית - עובדת לכל הפלטפורמות)
     */
    async placeBet(userId, userName, platform, amountText) {
        // 1. פענוח סכום
        const amountMatch = amountText.match(/(\d+)/);
        const amount = amountMatch ? parseInt(amountMatch[0]) : 0;

        if (amount <= 0) return { status: 'invalid_amount', message: 'סכום לא תקין.' };

        // 2. וידוא משתמש וקבלת יתרה
        const userRef = await ensureUserExists(userId, userName, platform);
        const doc = await userRef.get();
        const balance = doc.data()?.economy?.balance || 0;

        // 3. בדיקת כיסוי / הלוואה
        if (balance <= 0) {
            const LOAN = 100;
            await userRef.update({ 'economy.balance': admin.firestore.FieldValue.increment(LOAN) });
            return { status: 'broke', message: `💸 אין לך שקל. קיבלת הלוואה של ${LOAN} ע"ח הבית.` };
        }

        if (balance < amount) {
            return { status: 'insufficient_funds', message: `🛑 אין כיסוי. יש לך רק ₪${balance}.` };
        }

        // 4. ביצוע ההימור (גביית תשלום)
        await userRef.update({ 'economy.balance': admin.firestore.FieldValue.increment(-amount) });
        this.manageSession();

        // 5. הגרלת תוצאה (RNG - 48% סיכוי)
        const isWin = Math.random() < 0.48;
        const resultAmount = isWin ? amount * 2 : 0;
        const newBalance = isWin ? (balance + amount) : (balance - amount);

        // עדכון סטטיסטיקות
        const updatePayload = {
            'stats.casinoWins': admin.firestore.FieldValue.increment(isWin ? 1 : 0),
            'stats.casinoLosses': admin.firestore.FieldValue.increment(isWin ? 0 : 1)
        };
        if (isWin) {
            updatePayload['economy.balance'] = admin.firestore.FieldValue.increment(resultAmount);
        }
        await userRef.update(updatePayload);

        return {
            status: 'success',
            result: isWin ? 'WIN' : 'LOSS',
            amount,
            newBalance,
            asset: isWin ? CASINO_ASSETS.winGif : CASINO_ASSETS.loseGif,
            caption: isWin 
                ? `🤑 **יש זכייה!**\nלקחת ${resultAmount} שקל.\n💰 יתרה: ₪${newBalance}` 
                : `📉 **הלך הכסף...**\nהפסדת ${amount}.\n💰 יתרה: ₪${newBalance}`
        };
    }

    manageSession() {
        if (!this.activeSession.isActive) {
            this.activeSession.isActive = true;
            this.activeSession.startTime = Date.now();
        }
        if (this.sessionTimer) clearTimeout(this.sessionTimer);
        this.sessionTimer = setTimeout(() => {
            this.activeSession.isActive = false;
        }, 120000); // סגירה אחרי 2 דקות שקט
    }
}

module.exports = new CasinoSystem();
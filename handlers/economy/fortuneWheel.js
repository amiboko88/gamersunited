const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const userManager = require('../../handlers/users/manager'); // לשימוש בחיפוש פעילים

class FortuneWheel {

    constructor() {
        this.PRIZES = [
            { id: 'coins_100', name: '100 ₪', type: 'coins', amount: 100, weight: 40 },
            { id: 'coins_500', name: '500 ₪', type: 'coins', amount: 500, weight: 20 },
            { id: 'xp_250', name: '250 XP', type: 'xp', amount: 250, weight: 25 },
            { id: 'immunity', name: '🛡️ חסינות', type: 'item', itemId: 'immunity_ticket', weight: 10 },
            { id: 'vip', name: '👑 VIP', type: 'role', roleId: 'vip_gold', weight: 5 } // נדיר
        ];
    }

    /**
     * בוחר זוכה שבועי ושומר אותו ב-DB
     * נקרא ע"י ה-Cron
     */
    async selectWeeklyWinner(clients) {
        try {
            // 1. שליפת משתמשים פעילים (ששלחו לפחות 50 הודעות החודש)
            // לצורך פשטות: נשלוף את ה-Weekly Snapshot או נשתמש ב-Inactivity check
            const snapshot = await db.collection('users').where('stats.messagesSent', '>', 10).get();
            const candidates = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // חובה: משתמש עם חשבון טלגרם מקושר
                if (data.platforms?.telegram) {
                    candidates.push({ id: doc.id, ...data });
                }
            });

            if (candidates.length === 0) return log('⚠️ [Wheel] אין מועמדים להגרלה.');

            // 2. הגרלה
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            const telegramId = winner.platforms?.telegram;

            if (!telegramId) return log(`⚠️ [Wheel] הזוכה ${winner.id} אין לו טלגרם. מדלג.`);

            // 3. שמירת סטטוס הזכייה
            await db.collection('system_metadata').doc('fortune_wheel').set({
                currentWinner: {
                    userId: winner.id,
                    telegramId: telegramId,
                    displayName: winner.identity?.displayName,
                    awardedAt: new Date().toISOString(),
                    hasSpun: false
                }
            });

            // 4. שליחת הודעה לטלגרם
            if (clients.telegram) {
                const { InlineKeyboard } = require("grammy");
                // ה-URL חייב להיות HTTPS ואמיתי. ב-DEV נשתמש ב-Ngrok או כתובת השרת
                // כאן נניח ש-process.env.PUBLIC_URL מוגדר, או שנשתמש בכתובת סטטית
                const webAppUrl = `${process.env.PUBLIC_URL}/telegram/wheel.html?uid=${winner.id}`;

                const keyboard = new InlineKeyboard()
                    .webApp("🎰 סובב עכשיו!", webAppUrl);

                await clients.telegram.api.sendMessage(
                    process.env.TELEGRAM_CHAT_ID, // שולח לקבוצה
                    `🎁 **הגרלה שבועית!**\n\nמזל טוב ל-@${winner.identity?.displayName}!\nנבחרת לסובב את גלגל המזל.\nיש לך 24 שעות לקחת את הפרס!`,
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
            }

            log(`✅ [Wheel] הזוכה השבועי: ${winner.id} (${winner.identity?.displayName})`);

        } catch (error) {
            log(`❌ [Wheel] Select Winner Error: ${error.message}`);
        }
    }

    /**
     * מעבד את הסיבוב מה-Frontend
     */
    async processSpin(userId, platform) {
        // 1. אימות הזוכה
        const metaDoc = await db.collection('system_metadata').doc('fortune_wheel').get();
        if (!metaDoc.exists) throw new Error("No active lottery.");

        const { currentWinner } = metaDoc.data();
        if (currentWinner.userId !== userId) throw new Error("זה לא התור שלך יא גנב!");
        if (currentWinner.hasSpun) throw new Error("כבר סובבת את הגלגל! חזיר.");

        // 2. הגרלת פרס (Weighted Random)
        const prize = this._weightedRandom(this.PRIZES);

        // 3. עדכון המשתמש ומתן הפרס
        const userRef = db.collection('users').doc(userId);
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) return; // לא אמור לקרות

            const updateData = {
                // סימון שהפרס נלקח ברמת המשתמש אם רוצים
            };

            // חלוקת הפרס
            if (prize.type === 'coins') {
                updateData['economy.coins'] = (userDoc.data().economy?.coins || 0) + prize.amount;
            } else if (prize.type === 'xp') {
                updateData['economy.xp'] = (userDoc.data().economy?.xp || 0) + prize.amount;
            } else if (prize.type === 'item') {
                // לוגיקה להוספת פריט לאינוונטורי
                // updateData['inventory.' + prize.itemId] = ...
            }

            t.update(userRef, updateData);

            // עדכון המטא-דאטה שהסיבוב בוצע
            t.update(metaDoc.ref, { 'currentWinner.hasSpun': true, 'currentWinner.prizeParams': prize });
        });

        log(`🎰 [Wheel] User ${userId} won ${prize.name}`);
        return { success: true, prize: prize };
    }

    _weightedRandom(items) {
        let totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (const item of items) {
            if (random < item.weight) return item;
            random -= item.weight;
        }
        return items[0];
    }
}

module.exports = new FortuneWheel();

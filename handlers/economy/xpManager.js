// 📁 handlers/economy/xpManager.js
const { getUserRef } = require('../../utils/userUtils'); // ✅ חיבור ל-DB המאוחד
const { log } = require('../../utils/logger');

const LEVEL_FORMULA = level => 5 * (level ** 2) + 50 * level + 100;
const COOLDOWN_SECONDS = 60; 
const lastMessageTimestamps = new Map();

class XPManager {

    /**
     * מטפל בתוספת XP עבור הודעת טקסט (חוצה פלטפורמות)
     * @param {string} userId - מזהה המשתמש
     * @param {string} platform - 'discord' | 'whatsapp'
     * @param {string} content - תוכן ההודעה (לחישוב אורך)
     * @param {Object} contextObj - אובייקט ההודעה המקורי (לשליחת תגובה)
     * @param {Function} replyFunc - פונקציית תגובה (אופציונלי)
     */
    async handleXP(userId, platform, content, contextObj, replyFunc) {
        if (!content || !userId) return;

        const now = Date.now();
        const cooldownKey = `${platform}-${userId}`;

        // 1. בדיקת Cooldown (מניעת ספאם XP)
        if (lastMessageTimestamps.has(cooldownKey)) {
            const last = lastMessageTimestamps.get(cooldownKey);
            if ((now - last) / 1000 < COOLDOWN_SECONDS) return;
        }
        lastMessageTimestamps.set(cooldownKey, now);

        // 2. חישוב XP (לפי אורך ההודעה, עם תקרה)
        const charCount = content.length;
        const xpGain = Math.min(Math.floor(charCount / 10) + 5, 50); // מקסימום 50 להודעה

        try {
            const userRef = await getUserRef(userId, platform);
            
            // 3. עדכון אטומי ב-DB (Transaction)
            await userRef.firestore.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                if (!doc.exists) return; // משתמש צריך להיווצר בכניסה, לא כאן

                const data = doc.data();
                const economy = data.economy || { xp: 0, level: 1, balance: 0 };
                const stats = data.stats || {};
                
                let { xp, level } = economy;
                xp += xpGain;

                const nextLevelXp = LEVEL_FORMULA(level);
                let leveledUp = false;

                // בדיקת עליית רמה (תומך בעלייה כפולה)
                while (xp >= nextLevelXp) {
                    xp -= nextLevelXp;
                    level++;
                    leveledUp = true;
                }

                // שמירה
                t.update(userRef, {
                    'economy.xp': xp, 
                    'economy.level': level,
                    'stats.messagesSent': (stats.messagesSent || 0) + 1,
                    'meta.lastActive': new Date().toISOString()
                });

                // 4. הכרזה על עליית רמה
                if (leveledUp && replyFunc) {
                    const message = `🎉 **ברכות!** עלית לרמה **${level}**! ⭐`;
                    
                    if (platform === 'discord' && contextObj.channel) {
                        // בדיסקורד שולחים לערוץ (אולי נמחק אוטומטית אח"כ)
                        await contextObj.channel.send(message).catch(() => {});
                    } else if (platform === 'whatsapp') {
                        // בוואטסאפ מגיבים ישירות
                        await replyFunc(message);
                    }
                    
                    log(`[XP] 🆙 ${userId} (${platform}) leveled up to ${level}.`);
                }
            });
        } catch (error) {
            console.error(`[XP] Error processing for ${userId}:`, error.message);
        }
    }
}

module.exports = new XPManager();
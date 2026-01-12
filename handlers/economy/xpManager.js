// 📁 handlers/economy/xpManager.js
const { getUserRef } = require('../../utils/userUtils'); 
const { log } = require('../../utils/logger');
const graphics = require('../graphics/index'); 

const LEVEL_FORMULA = level => 5 * (level ** 2) + 50 * level + 100;
const COOLDOWN_SECONDS = 60; 
const lastMessageTimestamps = new Map();

class XPManager {

    async handleXP(userId, platform, content, contextObj, replyFunc) {
        if (!content || !userId) return;

        const now = Date.now();
        const cooldownKey = `${platform}-${userId}`;

        if (lastMessageTimestamps.has(cooldownKey)) {
            const last = lastMessageTimestamps.get(cooldownKey);
            if ((now - last) / 1000 < COOLDOWN_SECONDS) return;
        }
        lastMessageTimestamps.set(cooldownKey, now);

        const charCount = content.length;
        const xpGain = Math.min(Math.floor(charCount / 10) + 5, 50);

        try {
            const userRef = await getUserRef(userId, platform);
            
            await userRef.firestore.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                if (!doc.exists) return; // לא יוצרים משתמש על הודעה ראשונה, הוא צריך להירשם/להיות קיים

                const data = doc.data();
                let { xp, level } = data.economy || { xp: 0, level: 1 };
                xp += xpGain;

                const nextLevelXp = LEVEL_FORMULA(level);
                let leveledUp = false;

                while (xp >= nextLevelXp) {
                    xp -= nextLevelXp; // איפוס XP לרמה הבאה? או צבירה? 
                    // הערה: ברוב המשחקים ה-XP מצטבר. 
                    // אם הנוסחה שלך היא Cumulative (מצטברת), אל תפחית.
                    // אם הנוסחה היא "XP לרמה הבאה", אז תפחית. 
                    // הקוד המקורי שלך הפחית, אז נשאיר ככה:
                    xp -= nextLevelXp;
                    level++;
                    leveledUp = true;
                }

                t.update(userRef, {
                    'economy.xp': xp, 
                    'economy.level': level,
                    'stats.messagesSent': (data.stats?.messagesSent || 0) + 1,
                    'meta.lastActive': new Date().toISOString()
                });

                if (leveledUp && replyFunc) {
                    const name = data.identity?.displayName || "Gamer";
                    const avatar = data.identity?.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png"; 

                    // ✅ שליחת ה-XP העדכני לגרפיקה החדשה
                    const cardBuffer = await graphics.profile.generateLevelUpCard(name, level, xp, avatar);
                    
                    if (cardBuffer && platform === 'whatsapp') {
                        await contextObj.sock.sendMessage(contextObj.chatId, { 
                            image: cardBuffer, 
                            caption: `⭐ **LEVEL UP!**\nמזל טוב ${name}, הגעת לרמה ${level}!` 
                        });
                    } else {
                        // בדיסקורד שולחים טקסט (או תמונה אם רוצים להשקיע גם שם)
                        await replyFunc(`🎉 **LEVEL UP!** ${name} -> Level ${level}`);
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
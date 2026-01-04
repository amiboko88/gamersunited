// 📁 telegram/telegramLevelSystem.js
const db = require("../utils/firebase");
const { getUserRef } = require("../utils/userUtils"); 
const admin = require('firebase-admin');
const generateXPLeaderboardImage = require("./generateXPLeaderboardImage");
const { InputFile } = require("grammy");

const XP_PER_MESSAGE = 15;
const LEVEL_UP_MULTIPLIER = 100;

function calculateLevel(xp) {
    let level = 1;
    let nextLevelXpThreshold = LEVEL_UP_MULTIPLIER;
    while (xp >= nextLevelXpThreshold) {
        level++;
        nextLevelXpThreshold += (level + 1) * LEVEL_UP_MULTIPLIER;
    }
    return level;
}

// עדכון XP ב-DB המאוחד
async function updateXp(messageData, ctx = null) {
    const userId = messageData.id.toString();
    
    try {
        // משיג רפרנס למשתמש (יוצר קישור אם צריך)
        const userRef = await getUserRef(userId, 'telegram');
        
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            
            // נתונים התחלתיים אם המשתמש חדש
            let data = doc.exists ? doc.data() : {};
            let economy = data.economy || { xp: 0, level: 1, balance: 0 };
            let stats = data.stats || {};

            // חישוב
            economy.xp += XP_PER_MESSAGE;
            const newLevel = calculateLevel(economy.xp);
            
            // בדיקת עליית רמה
            if (newLevel > economy.level && ctx) {
                ctx.reply(`🎉 <b>מזל טוב ${messageData.first_name}!</b>\nעלית לרמה <b>${newLevel}</b>! 🚀`, { parse_mode: "HTML" }).catch(() => {});
            }
            
            economy.level = newLevel;
            stats.messagesSent = (stats.messagesSent || 0) + 1;

            // שמירה
            t.set(userRef, {
                economy,
                stats,
                identity: {
                    displayName: messageData.first_name, // מעדכן שם למקרה שהשתנה
                    telegramUsername: messageData.username || null
                },
                platforms: { telegram: userId },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });
        });

    } catch (error) {
        console.error("❌ Error updating Telegram XP:", error);
    }
}

// טיפול בבקשת טבלת המובילים
async function handleTop(bot) {
    bot.command("top", async (ctx) => {
        await sendLeaderboard(ctx);
    });
}

function registerTopButton(bot) {
    bot.callbackQuery("show_leaderboard", async (ctx) => {
        await ctx.answerCallbackQuery();
        await sendLeaderboard(ctx);
    });
}

// פונקציית שליחת התמונה
async function sendLeaderboard(ctx) {
    try {
        await ctx.replyWithChatAction("upload_photo");

        // שליפת 10 המובילים מה-DB המאוחד (Global Leaderboard)
        const snapshot = await db.collection('users')
            .orderBy('economy.xp', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            return ctx.reply("❌ עדיין אין נתונים בטבלה.");
        }

        const users = [];
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.identity?.displayName || data.identity?.fullName || 'Unknown';
            const xp = data.economy?.xp || 0;
            const level = data.economy?.level || 1;
            
            users.push({
                rank: rank++,
                username: name,
                xp: xp,
                level: level,
                avatarURL: "https://cdn.discordapp.com/embed/avatars/0.png" // ברירת מחדל לבינתיים
            });
        });

        // יצירת תמונה
        const imageBuffer = await generateXPLeaderboardImage(users);
        if (!imageBuffer) {
            return ctx.reply("😕 לא הצלחתי ליצור תמונה.");
        }

        await ctx.replyWithPhoto(new InputFile(imageBuffer, 'leaderboard.png'), { 
            caption: '🏆 <b>טבלת המובילים (Global)</b>', 
            parse_mode: "HTML" 
        });

    } catch (err) {
        console.error("❌ Error sending leaderboard:", err);
        ctx.reply("❌ שגיאה בשליפת הטבלה.");
    }
}

module.exports = { updateXp, handleTop, registerTopButton };
// 📁 telegram/telegramLevelSystem.js - מחובר ל-Unified DB
const db = require("../utils/firebase");
const { getUserRef } = require("../utils/userUtils"); // ✅ חיבור לתשתית החדשה
const admin = require('firebase-admin');
const generateXPLeaderboardImage = require("./generateXPLeaderboardImage");
const { InputFile } = require("grammy");

const XP_PER_MESSAGE = 15;
const LEVEL_UP_MULTIPLIER = 100;

// פונקציית עזר לחישוב רמה (אותה לוגיקה כמו בדיסקורד)
function calculateLevel(xp) {
    let level = 1; // מתחילים מרמה 1
    // נוסחה פשוטה יותר שתואמת לדיסקורד אם תרצה, כרגע שומר על הלוגיקה שלך:
    let nextLevelXpThreshold = LEVEL_UP_MULTIPLIER;
    while (xp >= nextLevelXpThreshold) {
        level++;
        nextLevelXpThreshold += (level + 1) * LEVEL_UP_MULTIPLIER;
    }
    return level;
}

async function updateXp(messageData, ctx = null) {
    const userId = messageData.id.toString();
    
    try {
        const userRef = await getUserRef(userId, 'telegram');
        
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            
            let currentXp = 0;
            let currentLevel = 1;
            let msgCount = 0;

            if (doc.exists) {
                const data = doc.data();
                currentXp = data.economy?.xp || 0;
                currentLevel = data.economy?.level || 1;
                msgCount = data.stats?.messagesSent || 0;
            }

            // הוספת XP
            const newXp = currentXp + XP_PER_MESSAGE;
            const newLevel = calculateLevel(newXp);
            
            // הכנת העדכון
            const updateData = {
                'economy.xp': newXp,
                'economy.level': newLevel,
                'stats.messagesSent': msgCount + 1,
                'identity.telegramId': userId, // וידוא שזה קיים
                'identity.displayName': messageData.first_name, // עדכון שם
                'meta.lastSeen': new Date().toISOString()
            };

            t.set(userRef, updateData, { merge: true });

            // הודעת עליית רמה
            if (newLevel > currentLevel && ctx) {
                await ctx.reply(`🎉 <b>ברכות ${messageData.first_name}!</b> עלית לרמה <b>${newLevel}</b>!`, { parse_mode: "HTML" });
            }
        });

    } catch (error) {
        console.error("❌ Error updating XP in Telegram:", error);
    }
}

// 🏆 טבלת מובילים (Leaderboard) - קורא מ-users
async function handleTop(bot) {
    bot.command("top", async (ctx) => {
        await sendLeaderboard(ctx);
    });
}

function registerTopButton(bot) {
    bot.callbackQuery("view_leaderboard", async (ctx) => {
        await sendLeaderboard(ctx);
    });
}

async function sendLeaderboard(ctx) {
    try {
        await ctx.replyWithChatAction("upload_photo");

        // שליפת 10 המובילים מהקולקשן הראשי
        const snapshot = await db.collection("users")
            .orderBy("economy.xp", "desc")
            .limit(10)
            .get();

        const users = [];
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            const xp = data.economy?.xp || 0;
            const level = data.economy?.level || 1;
            const name = data.identity?.displayName || data.identity?.fullName || "Unknown";
            
            // ניסיון להשיג תמונה (בטלגרם זה מורכב יותר כי אין URL קבוע ב-DB בדרך כלל)
            // נשתמש בברירת מחדל או ננסה לשלוף אם יש ID של טלגרם
            const telegramId = data.identity?.telegramId;
            
            users.push({
                rank: rank++,
                username: name,
                xp: xp,
                level: level,
                avatarURL: null, // נטפל בזה למטה
                id: telegramId
            });
        });

        // שליפת תמונות פרופיל מטלגרם עבור משתמשים שיש להם ID
        for (let user of users) {
            if (user.id && ctx) {
                try {
                    const photos = await ctx.api.getUserProfilePhotos(Number(user.id));
                    if (photos.total_count > 0) {
                        const fileId = photos.photos[0][0].file_id;
                        const link = await ctx.api.getFileLink(fileId);
                        user.avatarURL = link.href;
                    }
                } catch (e) { /* התעלם */ }
            }
        }

        const imageBuffer = await generateXPLeaderboardImage(users);
        if (!imageBuffer) {
            return ctx.reply("😕 לא הצלחתי ליצור תמונה.");
        }

        await ctx.replyWithPhoto(new InputFile(imageBuffer, 'leaderboard.png'), { 
            caption: '🏆 <b>טבלת המובילים (Global)</b>', 
            parse_mode: "HTML" 
        });

    } catch (err) {
        console.error("🚨 Leaderboard Error:", err);
        ctx.reply("⚠️ שגיאה זמנית ביצירת הטבלה.");
    }
}

module.exports = { updateXp, handleTop, registerTopButton };
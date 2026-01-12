// 📁 telegram/index.js
const { Bot, InputFile, GrammyError, HttpError } = require("grammy");
const { log } = require('../utils/logger');

// ייבוא המערכות
const xpManager = require('../handlers/economy/xpManager');
const brain = require('../handlers/ai/brain'); 
const memory = require('../handlers/ai/learning'); 
const contentModerator = require('../handlers/security/contentModerator'); 
const rankingCore = require('../handlers/ranking/core');
const graphics = require('../handlers/graphics/index'); // ✅ תיקון: ייבוא המערכת הגרפית החדשה
const { getUserData } = require('../utils/userUtils');

let bot = null;

// חישוב מספר שבוע (עזר ללידרבורד)
function getWeekNumber() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function launchTelegram() {
    if (bot) return; // מניעת כפילות

    if (!process.env.TELEGRAM_TOKEN) {
        log("❌ [TELEGRAM] חסר טוקן.");
        return;
    }

    bot = new Bot(process.env.TELEGRAM_TOKEN);

    // --- בדיקת דופק (Bypass Brain) ---
    bot.command("ping", (ctx) => {
        ctx.reply("פונג! אני חי וקיים. 🏓");
    });

    // --- 🏆 פקודת לידרבורד (חדש!) ---
    bot.command(["top", "leaderboard"], async (ctx) => {
        try {
            await ctx.replyWithChatAction("upload_photo");
            
            // 1. שליפת נתונים
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
            if (!leaders || leaders.length === 0) {
                return ctx.reply("❌ אין מספיק נתונים פעילים השבוע.");
            }

            const weekNum = getWeekNumber();

            // 2. יצירת תמונה (דרך המנוע החדש)
            const imageBuffer = await graphics.leaderboard.generateImage(leaders, weekNum);
            
            if (!imageBuffer) {
                return ctx.reply("❌ שגיאה ביצירת התמונה.");
            }

            // 3. שליחה
            await ctx.replyWithPhoto(new InputFile(imageBuffer), {
                caption: `🏆 <b>טבלת האלופים - שבוע ${weekNum}</b>\nהנתונים מתעדכנים בזמן אמת.`,
                parse_mode: "HTML"
            });

        } catch (error) {
            console.error("Telegram Leaderboard Error:", error);
            ctx.reply("תקלה בהפקת הדוח.");
        }
    });

    // --- 📊 פקודת סטטוס אישי ---
    bot.command(["me", "stats"], async (ctx) => {
        try {
            await ctx.replyWithChatAction("upload_photo");
            const userId = ctx.from.id.toString();
            
            // שימוש בכלי ה-Identity שיש לו כבר לוגיקה לכרטיס
            // אבל כאן נקרא ישירות לגרפיקה לחסוך סיבוך
            const userData = await getUserData(userId, 'telegram');
            
            if (!userData) return ctx.reply("אין לי נתונים עליך עדיין.");

            const name = userData.identity?.displayName || ctx.from.first_name;
            const level = userData.economy?.level || 1;
            const xp = userData.economy?.xp || 0;
            const avatar = "https://cdn.discordapp.com/embed/avatars/0.png"; // בטלגרם קשה להשיג URL יציב לאווטאר בקלות

            const cardBuffer = await graphics.profile.generateLevelUpCard(name, level, xp, avatar);
            
            if (cardBuffer) {
                await ctx.replyWithPhoto(new InputFile(cardBuffer), {
                    caption: `📊 <b>הפרופיל של ${name}</b>`,
                    parse_mode: "HTML"
                });
            } else {
                ctx.reply(`רמה: ${level} | XP: ${xp}`);
            }

        } catch (error) {
            console.error("Telegram Stats Error:", error);
            ctx.reply("שגיאה בשליפת פרופיל.");
        }
    });

    // --- טיפול בהודעות שוטפות (AI + XP) ---
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id.toString();

        try {
            // 1. צבירת XP
            xpManager.handleXP(userId, 'telegram', text, ctx, (msg) => ctx.reply(msg));

            // 2. בדיקת טריגרים למענה
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            const hasTrigger = text.includes("שמעון") || text.includes("שימי");
            
            if (isReplyToBot || hasTrigger) {
                await ctx.replyWithChatAction("typing");
                const response = await brain.ask(userId, 'telegram', text);
                
                if (response) {
                    await ctx.reply(response, { reply_to_message_id: ctx.message.message_id });
                }
            }
        } catch (error) {
            console.error('❌ [TELEGRAM ERROR] שגיאה בטיפול בהודעה:', error);
        }
    });

    bot.catch((err) => console.error(`⚠️ Telegram Error: ${err.message}`));

    // הפעלה
    bot.start({
        allowed_updates: ["message"],
        drop_pending_updates: true,
        onStart: (info) => log(`✅ [TELEGRAM] מחובר כ-@${info.username}`)
    });
}

async function stopTelegram() {
    if (bot) {
        log("🛑 [TELEGRAM] עוצר...");
        await bot.stop();
        bot = null;
    }
}

module.exports = { launchTelegram, stopTelegram };
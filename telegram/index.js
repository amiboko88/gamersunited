// 📁 telegram/index.js
const { Bot, InputFile, GrammyError, HttpError } = require("grammy");
const { log } = require('../utils/logger');

// ייבוא המערכות המרכזיות
const xpManager = require('../handlers/economy/xpManager');
const brain = require('../handlers/ai/brain'); 
const memory = require('../handlers/ai/learning'); 
const contentModerator = require('../handlers/security/contentModerator'); 
const rankingCore = require('../handlers/ranking/core');
const rankingRenderer = require('../handlers/ranking/render');
const { getUserData } = require('../utils/userUtils');

let bot = null;

async function launchTelegram() {
    if (!process.env.TELEGRAM_TOKEN) {
        log("❌ [TELEGRAM] חסר טוקן. המערכת לא תעלה.");
        return;
    }

    // מניעת יצירה כפולה אם הפונקציה נקראת פעמיים בטעות
    if (bot) {
        log("⚠️ [TELEGRAM] הבוט כבר רץ. מדלג על אתחול מחדש.");
        return;
    }

    bot = new Bot(process.env.TELEGRAM_TOKEN);

    // --- 1. טיפול בהודעות טקסט ---
    bot.on("message:text", async (ctx) => {
        try {
            const text = ctx.message.text;
            const userId = ctx.from.id.toString();
            
            // א. בדיקת אבטחה
            const safety = await contentModerator.checkContent(text);
            if (!safety.isSafe) return ctx.deleteMessage().catch(() => {});

            // ב. מתן XP
            xpManager.handleXP(userId, 'telegram', text, ctx, (msg) => ctx.reply(msg));

            // ג. למידה פסיבית
            memory.learn(userId, text, 'telegram').catch(e => console.error('Learning Error:', e));

            // ד. בדיקה אם צריך לענות
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            const hasTrigger = text.includes("שמעון") || text.includes("שימי");
            const randomIntervention = Math.random() < 0.02; 

            if (isReplyToBot || hasTrigger || randomIntervention) {
                await ctx.replyWithChatAction("typing");
                const response = await brain.ask(userId, 'telegram', text);
                await ctx.reply(response, { reply_to_message_id: ctx.message.message_id });
            }
        } catch (error) {
            console.error('[Telegram Msg Error]', error.message);
        }
    });

    // --- 2. פקודות (Commands) ---
    
    bot.command("top", async (ctx) => {
        try {
            await ctx.replyWithChatAction("upload_photo");
            const leaders = await rankingCore.getWeeklyLeaderboard(5);
            if (leaders.length === 0) return ctx.reply("הטבלה ריקה עדיין.");
            const buffer = await rankingRenderer.generateLeaderboardImage(leaders, 'המובילים');
            await ctx.replyWithPhoto(new InputFile(buffer, 'top.png'), { caption: "🏆 **טבלת האלופים**" });
        } catch (e) { ctx.reply("שגיאה בהפקת טבלה."); }
    });

    bot.command("stats", async (ctx) => {
        try {
            const userId = ctx.from.id.toString();
            const userData = await getUserData(userId, 'telegram');
            
            if (!userData) return ctx.reply("אין לי נתונים עליך יא בוט.");

            const level = userData.economy?.level || 1;
            const xp = userData.economy?.xp || 0;
            const balance = userData.economy?.balance || 0;
            const msgCount = userData.stats?.messagesSent || 0;

            await ctx.reply(
                `📊 **הסטטוס של ${ctx.from.first_name}:**\n\n` +
                `⭐ רמה: **${level}**\n` +
                `✨ XP: **${Math.floor(xp)}**\n` +
                `💰 כסף: **₪${balance.toLocaleString()}**\n` +
                `💬 הודעות: **${msgCount}**`
            );
        } catch (e) { console.error(e); }
    });

    bot.command("start", (ctx) => ctx.reply("אני פה. תכתוב, תקבל XP. פשוט."));

    // --- טיפול בשגיאות קריטיות (מונע קריסה של כל הבוט) ---
    bot.catch((err) => {
        const ctx = err.ctx;
        const e = err.error;
        console.error(`⚠️ Telegram Error handling update ${ctx.update.update_id}:`);
        if (e instanceof GrammyError) console.error("Error in request:", e.description);
        else if (e instanceof HttpError) console.error("Could not contact Telegram:", e);
        else console.error("Unknown error:", e);
    });

    // --- 🚀 הפעלה בטוחה עם מנגנון כיבוי ---
    
    // מאזינים לסיגנל כיבוי מהשרת (Railway)
    // זה קריטי! זה מבטיח שהבוט יתנתק מסודר לפני שהגרסה החדשה עולה
    const stopRunner = () => {
        if (bot) {
            log("🛑 [TELEGRAM] עוצר את הבוט בצורה מסודרת...");
            bot.stop();
        }
    };
    process.once("SIGINT", stopRunner);
    process.once("SIGTERM", stopRunner);

    // התחלת הבוט (Start Polling)
    // drop_pending_updates: true -> מתעלם מהודעות שנשלחו בזמן שהבוט היה כבוי כדי למנוע הצפה בהתחלה
    bot.start({
        allowed_updates: ["message"],
        drop_pending_updates: true,
        onStart: (botInfo) => {
            log(`✅ [TELEGRAM] שמעון מחובר ומאזין כ-@${botInfo.username}`);
        }
    });
}

// שינוי קריטי: אנחנו מייצאים את פונקציית האתחול, לא את הבוט עצמו שרץ מיד
module.exports = { launchTelegram };
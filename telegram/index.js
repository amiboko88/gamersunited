// 📁 telegram/index.js
const { Bot, InputFile } = require("grammy");
const { log } = require('../utils/logger');

// ייבוא המערכות המרכזיות
const xpManager = require('../handlers/economy/xpManager');
const brain = require('../handlers/ai/brain'); 
const memory = require('../handlers/ai/learning'); // ✅ הוספתי את הזיכרון (תרחיש 5)
const contentModerator = require('../handlers/security/contentModerator'); 
const rankingCore = require('../handlers/ranking/core');
const rankingRenderer = require('../handlers/ranking/render');
const { getUserData } = require('../utils/userUtils'); // ✅ בשביל פקודת הסטטוס

if (!process.env.TELEGRAM_TOKEN) {
    log("❌ [TELEGRAM] חסר טוקן. המערכת לא תעלה.");
} else {

    const bot = new Bot(process.env.TELEGRAM_TOKEN);

    // --- 1. טיפול בהודעות טקסט ---
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id.toString();
        
        // א. בדיקת אבטחה
        const safety = await contentModerator.checkContent(text);
        if (!safety.isSafe) return ctx.deleteMessage().catch(() => {});

        // ב. מתן XP
        xpManager.handleXP(userId, 'telegram', text, ctx, (msg) => ctx.reply(msg));

        // ג. ✅ למידה פסיבית (תרחיש 5 - התיקון!)
        // אנחנו שולחים ללמידה ברקע (בלי await כדי לא לעכב)
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
    });

    // --- 2. פקודות (Commands) ---
    
    bot.command("top", async (ctx) => {
        await ctx.replyWithChatAction("upload_photo");
        const leaders = await rankingCore.getWeeklyLeaderboard(5);
        if (leaders.length === 0) return ctx.reply("הטבלה ריקה עדיין.");
        const buffer = await rankingRenderer.generateLeaderboardImage(leaders, 'המובילים');
        await ctx.replyWithPhoto(new InputFile(buffer, 'top.png'), { caption: "🏆 **טבלת האלופים**" });
    });

    // ✅ פקודת סטטוס (תרחיש 1 - התיקון!)
    bot.command("stats", async (ctx) => {
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
    });

    bot.command("start", (ctx) => ctx.reply("אני פה. תכתוב, תקבל XP. פשוט."));

    bot.catch((err) => console.error("⚠️ Telegram Error:", err));
    bot.start();
    log("✅ [TELEGRAM] שמעון מחובר ומאזין.");

    module.exports = bot;
}
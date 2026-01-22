const { InputFile } = require("grammy");
const rankingCore = require('../../handlers/ranking/core'); // ✅ תוקן נתיב
const graphics = require('../../handlers/graphics/index'); // ✅ תוקן נתיב
const { getUserData } = require('../../utils/userUtils'); // ✅ תוקן נתיב (זה ב-root/utils)

// חישוב מספר שבוע
function getWeekNumber() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = (bot) => {

    // --- Ping ---
    bot.command("ping", (ctx) => {
        ctx.reply("פונג! אני חי וקיים. 🏓");
    });

    // 🕵️ Debug: Reveal Chat ID
    bot.command("id", (ctx) => {
        ctx.reply(`🆔 **Chat ID:** \`${ctx.chat.id}\``, { parse_mode: "Markdown" });
    });

    // --- 🏆 Leaderboard ---
    bot.command(["top", "leaderboard"], async (ctx) => {
        try {
            await ctx.replyWithChatAction("upload_photo");
            const leaders = await rankingCore.getWeeklyLeaderboard(10);

            if (!leaders || leaders.length === 0) {
                return ctx.reply("❌ אין מספיק נתונים פעילים השבוע.");
            }

            const weekNum = getWeekNumber();
            const imageBuffer = await graphics.leaderboard.generateImage(leaders, weekNum);

            if (!imageBuffer) return ctx.reply("❌ שגיאה ביצירת התמונה.");

            await ctx.replyWithPhoto(new InputFile(imageBuffer), {
                caption: `🏆 <b>טבלת האלופים - שבוע ${weekNum}</b>\nהנתונים מתעדכנים בזמן אמת.`,
                parse_mode: "HTML"
            });
        } catch (error) {
            console.error("Telegram Leaderboard Error:", error);
            ctx.reply("תקלה בהפקת הדוח.");
        }
    });

    // --- 📊 Me / Stats ---
    bot.command(["me", "stats"], async (ctx) => {
        try {
            await ctx.replyWithChatAction("upload_photo");
            const telegramId = ctx.from.id.toString();

            // משתמשים ב-UserUtils המעודכן שיודע לחפש לפי Telegram ID
            const userData = await getUserData(telegramId, 'telegram');

            if (!userData) {
                return ctx.reply("❌ לא מצאתי נתונים עליך.\nאנא וודא שאתה מקושר למערכת.");
            }

            const name = userData.identity?.displayName || ctx.from.first_name;
            const level = userData.economy?.level || 1;
            const xp = userData.economy?.xp || 0;

            // שליפת תמונה (אם יש)
            let avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
            try {
                const photos = await ctx.api.getUserProfilePhotos(ctx.from.id, { limit: 1 });
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const file = await ctx.api.getFile(fileId);
                    avatar = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
                }
            } catch (e) { }

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
    // --- 🔄 Sync Command ---
    const flowHandler = require('./flow');
    bot.command("start", async (ctx) => {
        // תמיכה ב-Deep Linking: t.me/bot?start=sync
        if (ctx.match === "sync") {
            await flowHandler.handleSyncCommand(ctx);
        } else {
            ctx.reply("ברוכים הבאים ל-Gamers United! 🎮");
        }
    });

    bot.command("sync", flowHandler.handleSyncCommand);
};

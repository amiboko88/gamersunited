// 📁 telegram/index.js
const { Bot, InputFile, GrammyError, HttpError } = require("grammy");
const { log } = require('../utils/logger');

// ייבוא המערכות
const xpManager = require('../handlers/economy/xpManager');
const brain = require('../handlers/ai/brain'); 
const memory = require('../handlers/ai/learning'); 
const contentModerator = require('../handlers/security/contentModerator'); 
const rankingCore = require('../handlers/ranking/core');
const rankingRenderer = require('../handlers/ranking/render');
const { getUserData } = require('../utils/userUtils');

let bot = null;

async function launchTelegram() {
    if (bot) return; // מניעת כפילות

    if (!process.env.TELEGRAM_TOKEN) {
        log("❌ [TELEGRAM] חסר טוקן.");
        return;
    }

    bot = new Bot(process.env.TELEGRAM_TOKEN);

    // --- בדיקת דופק (Bypass Brain) ---
    // תכתוב /ping בטלגרם כדי לראות אם הוא מגיב בכלל
    bot.command("ping", (ctx) => {
        console.log("🏓 [DEBUG] Ping command received!");
        ctx.reply("פונג! אני חי וקיים. 🏓");
    });

    // --- טיפול בהודעות ---
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id.toString();

        console.log(`📨 [DEBUG] התקבלה הודעה: "${text}" מ-${userId}`);

        try {
            // 1. בדיקת XP (האם זה עובד?)
            xpManager.handleXP(userId, 'telegram', text, ctx, (msg) => ctx.reply(msg));

            // 2. בדיקת טריגרים (האם הוא אמור לענות?)
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            const hasTrigger = text.includes("שמעון") || text.includes("שימי");
            
            // לצורך בדיקה: אני מבטל את הראנדום! הוא יענה תמיד אם יש טריגר
            // const randomIntervention = Math.random() < 0.02; 

            console.log(`🔍 [DEBUG] בדיקת טריגרים: Trigger=${hasTrigger}, Reply=${isReplyToBot}`);

            if (isReplyToBot || hasTrigger) {
                console.log("🧠 [DEBUG] נכנס למוח (Brain)... ממתין לתשובה...");
                
                await ctx.replyWithChatAction("typing");
                
                // כאן אנחנו נראה אם הוא נתקע
                const response = await brain.ask(userId, 'telegram', text);
                
                console.log(`🗣️ [DEBUG] המוח ענה! תשובה באורך: ${response?.length}`);
                
                if (!response) {
                    await ctx.reply("המוח שלי ריק כרגע (חזר null).");
                } else {
                    await ctx.reply(response, { reply_to_message_id: ctx.message.message_id });
                }
            } else {
                console.log("fa [DEBUG] הודעה נשמרה בלוג אך לא דרשה מענה.");
            }
        } catch (error) {
            console.error('❌ [TELEGRAM ERROR] שגיאה בטיפול בהודעה:', error);
            await ctx.reply(`שגיאה פנימית: ${error.message}`);
        }
    });

    // ... (שאר הפקודות top/stats/start נשארות אותו דבר - תעתיק אותן אם צריך) ...

    bot.catch((err) => console.error(`⚠️ Telegram Error: ${err.message}`));

    // הפעלה
    bot.start({
        allowed_updates: ["message"],
        drop_pending_updates: true,
        onStart: (info) => log(`✅ [TELEGRAM] מחובר כ-@${info.username} (DEBUG MODE)`)
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
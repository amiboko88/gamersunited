import { Bot } from "grammy";

// הכנסת ה-TOKEN ישירות או מהסביבה
const bot = new Bot(process.env.TELEGRAM_TOKEN || "7208539571:AAHMHg2K6-pa1FgmNoeY4627c49hxgFdBHU");

// זה הקטע שאתה ניסית – עכשיו הוא במקום הנכון:
bot.on("message", async (ctx) => {
  console.log("✅ CHAT ID IS:", ctx.chat.id);
});

bot.start();

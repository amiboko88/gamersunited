// 📁 shimonTelegram.js
const { Bot, InlineKeyboard } = require("grammy");
const { run } = require("@grammyjs/runner");
const admin = require("firebase-admin");

const { handleTrigger } = require("./telegramTriggers");
const { detectAndRespondToSwear } = require("./telegramCurses");
const registerTelegramCommands = require("./telegramCommands");

// יצירת הבוט
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// התחברות ל־Firestore (מניעת כפילות יוזמות)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIAL))
  });
}
const db = admin.firestore();

// פקודת /start עם כפתורי פעולה
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "חבר";
  await ctx.reply(`שלום ${name}, שמעון מחובר.`, {
    reply_markup: new InlineKeyboard()
      .text("🔥 עדכן אותי ב־MVP השבועי", "mvp_update")
      .text("📊 סטטיסטיקות מהדיסקורד", "stats")
  });

  // לוג ראשוני
  await db.collection("telegram_logs").add({
    telegram_id: ctx.from.id,
    username: ctx.from.username,
    action: "start",
    timestamp: Date.now()
  });
});

// כפתורי אינליין
bot.callbackQuery("mvp_update", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🏆 כרגע אין MVP זמין... בקרוב!");
});

bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("📊 הנתונים מהדיסקורד עוד לא מחוברים... תתכונן!");
});

// הודעות רגילות
bot.on("message", async (ctx) => {
  if (detectAndRespondToSwear(ctx)) return;
  if (handleTrigger(ctx)) return;
});

// פקודות נוספות (חוץ מ־start/help)
registerTelegramCommands(bot);

// מניעת הפעלה כפולה ב־Railway
if (require.main === module) {
  run(bot);
}

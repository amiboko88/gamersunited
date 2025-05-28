const { Bot, InlineKeyboard } = require("grammy");
const { run } = require("@grammyjs/runner");
const admin = require("firebase-admin");

const { handleTrigger } = require("./telegramTriggers");
const { detectAndRespondToSwear } = require("./telegramCurses");
const registerTelegramCommands = require("./telegramCommands");

// יצירת הבוט עם הטוקן מהסביבה
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// התחברות ל-Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIAL))
  });
}
const db = admin.firestore();

// פקודת פתיחה /start
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "חבר";
  await ctx.reply(`שלום ${name} וברוך הבא לבוט שמעון בטלגרם 🎮`, {
    reply_markup: new InlineKeyboard()
      .text("🔥 עדכן אותי ב־MVP השבועי", "mvp_update")
      .text("📊 סטטיסטיקות מהדיסקורד", "stats")
  });

  await db.collection("telegram_logs").add({
    telegram_id: ctx.from.id,
    username: ctx.from.username,
    action: "start",
    timestamp: Date.now()
  });
});

// תגובות ללחיצה על כפתורי Inline
bot.callbackQuery("mvp_update", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🏆 כרגע אין MVP זמין... בקרוב!");
});

bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("📊 הנתונים מהדיסקורד עוד לא מחוברים... תתכונן!");
});

// תגובה לכל הודעה נכנסת
bot.on("message", async (ctx) => {
  if (detectAndRespondToSwear(ctx)) return; // זיהוי קללות
  if (handleTrigger(ctx)) return;          // לינקים, תיוגים, מילים
});

// רישום הפקודות /prophecy, /laugh וכו'
registerTelegramCommands(bot);

// הפעלת הבוט (Polling / Webhook לפי הסביבה)
run(bot);

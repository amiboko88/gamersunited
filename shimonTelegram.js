const { Bot, InlineKeyboard } = require("grammy");
const admin = require("firebase-admin");

// יצירת הבוט עם טוקן
const bot = new Bot(process.env.TELEGRAM_TOKEN || "7208539571:AAHMHg2K6-pa1FgmNoeY4627c49hxgFdBHU");

// אתחול Firestore
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// בדיקה זמנית – להוציא chat_id
bot.on("message", async (ctx) => {
  console.log("✅ CHAT ID IS:", ctx.chat.id);
});

// פקודת פתיחה
bot.command("start", async (ctx) => {
  const name = ctx.from.first_name || "חבר";
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

// תגובה לכפתור MVP
bot.callbackQuery("mvp_update", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🏆 כרגע אין MVP זמין... בקרוב!");
});

// תגובה לכפתור סטטיסטיקות
bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("📊 הנתונים מהדיסקורד עוד לא מחוברים... תתכונן!");
});

// הפעלת הבוט
bot.start();

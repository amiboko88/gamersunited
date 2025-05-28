// 📁 shimonTelegram.js – גרסה חכמה עם Webhook ל־Railway, כולל Slash + טריגרים + קללות + Firebase
require('dotenv').config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");
const { setupTelegramCommands, handleSlashCommand } = require("./telegramCommands");
const db = require("./utils/firebase");

const bot = new Bot(process.env.TELEGRAM_TOKEN);
bot.context.db = db;

// 🔌 API Monitoring
bot.api.config.use((prev, method, payload, signal) => {
  console.log("📡 TELEGRAM API:", method);
  return prev(method, payload, signal);
});

// 💬 הודעות רגילות עם טריגרים + קללות
bot.on("message", async ctx => {
  const chatId = ctx.chat.id;
  if (await handleTrigger(ctx)) return;

  // ניתן להוסיף לוג או ניתוח טקסט נוסף כאן
});

// 🧵 Slash Commands — כולל /start וכל הקיימים
bot.command([
  "start", "עזרה", "חוקים", "מה_הולך",
  "פיפו", "תנו_כבוד", "בדוק"
], async ctx => {
  await handleSlashCommand(ctx);
});

// 🔘 Callback Query (כפתורים)
bot.on("callback_query:data", async ctx => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();
  if (data === "rules_accept") {
    await ctx.reply("✅ קיבלת את חוקי שמעון. בהצלחה 🍀");
  } else {
    await ctx.reply(`🔘 לחצת על: ${data}`);
  }
});

// ⏰ תזכורת אם שקט 24 שעות
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000); // כל 10 דקות בדיקה

// 🛠️ הגדרת פקודות Slash ברגע עלייה
setupTelegramCommands(bot);

// 🌐 Webhook Listener (Express) – חובה ל־Railway
const app = express();
app.use(express.json());
app.use("/telegram", webhookCallback(bot, "express"));

// 🚀 הפעלה
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, async () => {
  const fullUrl = `${process.env.RAILWAY_STATIC_URL}/telegram`;
  try {
    await bot.api.setWebhook(fullUrl);
    console.log("✅ Webhook עודכן:", fullUrl);
  } catch (e) {
    console.error("❌ שגיאה בהגדרת Webhook:", e.message);
  }
  console.log(`🚀 שמעון טלגרם מאזין דרך Webhook על פורט ${PORT}`);
});

// 🧪 ניטור שגיאות
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

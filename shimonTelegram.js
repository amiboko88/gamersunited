require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const registerBirthdayHandler = require("./telegramBirthday");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");
// const handleSmartReply = require("./shimonSmart"); // מנוטרל זמנית
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 🧠 זמינות DB
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום Slash וימי הולדת
registerCommands(bot);
registerBirthdayHandler(bot);

// 🧠 טיפול בהודעות טקסט רגילות בלבד
bot.on("message", async (ctx) => {
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.trim() || "";
  if (text.startsWith("/")) {
    console.log("⚙️ Slash Command – מדלג");
    return;
  }

  console.log("📥 נלכדה הודעה:", text);

  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) {
    console.log("☠️ Curse טופל");
    return;
  }

  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) {
    console.log("🎯 טריגר הופעל");
    return;
  }

  // ⛔️ שמעון מנוטרל לבדיקה
  console.log("🟡 שמעון מנותק זמנית – אם הגעת לכאן, הקוד תקין.");
});

// 🌐 Webhook ל־Railway
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";

  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch((err) => {
    console.error("❌ שגיאה בהרשמת Webhook:", err);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 האזנה ל־Webhook בטלגרם בפורט ${port}`);
  });

  // 🎂 שליחת ברכות ב־9:00
  const now = new Date();
  const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));

  // ⏰ בדיקת שקט יומית
  setInterval(() => {
    checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
  }, 10 * 60 * 1000);
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

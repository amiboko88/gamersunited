// 📁 shimonTelegram.js – גרסה מאוחדת יציבה ל־Webhook (RAILWAY + Firestore)

require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const handleSmartReply = require("./shimonSmart");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 🗄️ חיבור בסיס נתונים
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום Slash Commands
registerCommands(bot);

// 🧠 ניתוח הודעות
bot.on("message", async (ctx) => {
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.toLowerCase() || "";

  // 1. קללות
  const cursed = await handleCurses(ctx, text);
  if (cursed) return;

  // 2. טריגרים
  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

  // 3. תגובה חכמה
  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) return;
});

// ⏰ תזכורת שקט
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000); // כל 10 דקות

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
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

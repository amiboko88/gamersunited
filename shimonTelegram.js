// 📁 shimonTelegram.js – גרסה מאוחדת יציבה ל־Webhook (RAILWAY + Firestore)More actions

require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");

const bot = new Bot(process.env.TELEGRAM_TOKEN);
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});


// 📌 רישום Slash
registerCommands(bot);

// 🧠 ניתוח הודעות
bot.on("message", async (ctx) => {
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.toLowerCase() || "";

  const cursed = await handleCurses(ctx, text);
  if (cursed) return;

  const triggered = handleTrigger(ctx);
  if (triggered) return;

});

// ⏰ תזכורת אם שקט 24 שעות
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000); // כל 10 דקות בדיקה

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
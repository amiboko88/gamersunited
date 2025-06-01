// 📁 shimonTelegram.js – גרסה מאוחדת יציבה ל־Webhook עם Slash, טקסטים ו־GPT
require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const registerBirthdayHandler = require("./telegramBirthday");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");
const handleSmartReply = require("./shimonSmart");
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

// 🧠 ניתוח טקסטים רגילים בלבד (לא פקודות Slash)
bot.on("message", async (ctx) => {
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.trim() || "";
  console.log("📥 נקלט טקסט:", text);

  // 🎛️ סינון Slash
  if (text.startsWith("/")) {
    console.log("⚙️ Slash Command – לא מגיב כאן");
    return;
  }

  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) return;

  console.log("ℹ️ לא הופעלה תגובה.");
});

// 🌐 Webhook ל־Railway
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";

  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl, {
    allowed_updates: ["message", "edited_message", "callback_query", "inline_query", "poll"]
  }).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch((err) => {
    console.error("❌ שגיאה בהרשמת Webhook:", err);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 האזנה ל־Webhook בטלגרם בפורט ${port}`);
  });

  // 🎂 ברכות יומיות ב־9:00
  const now = new Date();
  const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));

  // 🔁 ניטור שקט יומי
  setInterval(() => {
    checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
  }, 10 * 60 * 1000);
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

// 📁 shimonTelegram.js – בדיקה מדויקת לקליטת הודעות וסלאשים ב־Webhook

require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 🧠 זמינות DB
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום Slash Commands
registerCommands(bot);

// 🧪 האזנה מדויקת רק לטקסט (מבודדת לחלוטין)
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text?.trim();
  console.log("📥 נקלט טקסט:", text);

  if (ctx.message.from?.is_bot) {
    console.log("🤖 בוט – מדלג");
    return;
  }

  if (text.startsWith("/")) {
    console.log("⚙️ Slash Command – לא מגיב כאן");
    return;
  }

  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  const triggered = handleTrigger(ctx);
  if (triggered) return;

  // ⚠️ השמעון החכם מנוטרל זמנית לבדיקה
  console.log("🟡 שמעון חכם מושבת כרגע – הגעת לנקודה הסופית.");
});

// ⏰ תזכורת אם שקט
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000);

// 🌐 Webhook קלאסי ל־Railway
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
    console.log(`🚀 האזנה ל־Webhook בפורט ${port}`);
  });

  // 🎂 ברכות יומיות
  const now = new Date();
  const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

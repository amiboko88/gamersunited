// 📁 shimonTelegram.js – גרסה תקינה, אחידה, ותומכת Slash ותגובות

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

// 🧠 חיבור Firestore לכל הקשרים
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום Slash וימי הולדת
registerCommands(bot);
registerBirthdayHandler(bot);

// 🧠 ניתוח הודעות רגילות בלבד (לא סלאש)
bot.on("message", async (ctx) => {
  try {
    if (!ctx.message || ctx.message.from?.is_bot) return;

    const text = ctx.message.text?.trim() || "";
    if (text.startsWith("/")) {
      console.log("⚙️ Slash Command – מדלג על ניתוח שמעון");
      return;
    }

    console.log("📩 התקבלה הודעה:", text);

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

    const smart = await handleSmartReply(ctx, triggerResult);
    if (smart) {
      console.log("🧠 תשובה חכמה נשלחה");
      return;
    }

    console.log("ℹ️ לא הופעלה תגובה חכמה או טריגר.");
  } catch (err) {
    console.error("❌ שגיאה כללית בניתוח:", err.message);
  }
});

// 🌐 Webhook ל־Railway
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";

  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl, {
     allowed_updates: [
    "message",
    "callback_query",
    "inline_query",
    "edited_message",
    "poll"
  ]
  }).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch((err) => {
    console.error("❌ שגיאה בהרשמת Webhook:", err);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 האזנה ל־Webhook בטלגרם בפורט ${port}`);
  });

  // 🕘 שליחת ברכות בשעה 9:00 + כל 24 שעות
  const now = new Date();
  const millisUntilNine =
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;

  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));

  // ⏰ בדיקת שקט יומית
  setInterval(() => {
    checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
  }, 10 * 60 * 1000); // כל 10 דקות
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

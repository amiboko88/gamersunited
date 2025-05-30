require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const handleSmartReply = require("./shimonSmart");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const registerBirthdayHandler = require("./telegramBirthday");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");

const bot = new Bot(process.env.TELEGRAM_TOKEN);
const app = express();
const path = "/telegram";

// 🧠 זמינות DB
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום Slash Commands ותפריטי יום הולדת
registerCommands(bot);
registerBirthdayHandler(bot);

// ✅ הבוט מאזין להודעות רגילות בלבד (ולא פקודות Slash)
bot.on("message", async (ctx) => {
  try {
    if (!ctx.message || ctx.message.from?.is_bot) {
      console.log("⛔️ אין הודעה או שזה בוט");
      return;
    }

    const text = ctx.message.text || "";
    if (text.startsWith("/")) {
      console.log("⚙️ Slash Command – מדלג");
      return; // כדי לא להגיב פעמיים
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

    console.log("ℹ️ לא הופעלה שום תגובה.");
  } catch (err) {
    console.error("❌ שגיאה בטיפול בהודעה:", err.message);
  }
});

// 🌐 Webhook
app.use(express.json());
app.use(path, webhookCallback(bot, "express"));

// 🩺 בדיקת בריאות
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "✅ Express פועל! בוט טלגרם מאזין תקין",
    time: new Date().toISOString()
  });
});

// 🔁 תזכורת יומית
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000);

// 🚀 הרשמת Webhook + פתיחת פורט
if (process.env.RAILWAY_STATIC_URL) {
  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;

   bot.api.setWebhook(fullUrl, {
    allowed_updates: ["message", "callback_query"]
  }).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch((err) => {
    console.error("❌ שגיאה בהרשמת Webhook:", err);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 האזנה ל־Webhook בפורט ${port}`);
  });

  const now = new Date();
  const millisUntilNine =
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;

  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

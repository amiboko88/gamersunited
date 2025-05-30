// 📁 shimonTelegram.js – עם runner, webhook, ותגובות טקסט מלאות

require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const { run } = require("@grammyjs/runner"); // ✅ תוספת קריטית
const express = require("express");

const handleSmartReply = require("./shimonSmart");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const registerBirthdayHandler = require("./telegramBirthday");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 🧠 זמינות DB בהקשר
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 פקודות Slash ותפריטי יום הולדת
registerCommands(bot);
registerBirthdayHandler(bot);

// ✅ החייאת event listeners כמו bot.on("message")
run(bot, { runner: false }); // ❗ זה יפעיל רק event listeners, בלי getUpdates

const app = express();
const path = "/telegram";

// 🌡️ בריאות
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "✅ Express פועל! בוט טלגרם מאזין תקין",
    time: new Date().toISOString()
  });
});

app.use(express.json());
app.use(path, webhookCallback(bot, "express"));

// 🎯 תגובות טקסט רגילות
bot.on("message", async (ctx) => {
  console.log("📩 התקבלה הודעה:", ctx.message?.text || "[לא טקסט]");
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.toLowerCase() || "";

  console.log("🧪 בדיקת קללה...");
  const cursed = await handleCurses(ctx, text);
  if (cursed) {
    console.log("🔺 הופעלה תגובת קללה!");
    return;
  }

  console.log("🧪 בדיקת טריגר...");
  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) {
    console.log("🔺 הופעל טריגר!");
    return;
  }

  console.log("🧪 תגובה חכמה...");
  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) {
    console.log("🟢 הופעלה תגובה חכמה!");
    return;
  }

  console.log("ℹ️ לא הופעלה שום תגובה.");
});

// ⏰ תזכורת אוטומטית של שקט בקבוצה
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000);

// 🌐 Webhook ל־Railway
if (process.env.RAILWAY_STATIC_URL) {
  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch((err) => {
    console.error("❌ שגיאה בהרשמת Webhook:", err);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 האזנה ל־Webhook בטלגרם בפורט ${port}`);
    console.log("🌡️ בדיקת בריאות זמינה ב־/ (root)");
  });

  // 🎉 שליחת ברכות כל בוקר
  const now = new Date();
  const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;

  setTimeout(() => {
    sendBirthdayMessages();
    setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
  }, Math.max(millisUntilNine, 0));

} else {
  console.error("❌ חסר RAILWAY_STATIC_URL במשתני סביבה");
}

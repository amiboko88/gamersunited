// 📁 shimonTelegram.js – הגרסה היציבה ל־Railway + Grammy Webhook, כל פקודות הבוט, לוגים מתקדמים

require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

// כל הפיצ'רים שלך:
const handleSmartReply = require("./shimonSmart");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const registerBirthdayHandler = require("./telegramBirthday");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger, checkDailySilence } = require("./telegramTriggers");

// 🟢 קונסטרוקטור בוט
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// חיבור לבסיס נתונים – נוגע בכל ctx.db בפרויקט
bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// 📌 רישום כל Slash Commands
registerCommands(bot);
registerBirthdayHandler(bot);

// לוג בכל event – DEBUG
bot.on("message", async (ctx, next) => {
  console.log("📩 התקבלה הודעה:", ctx.message?.text || "[לא טקסט]");
  if (!ctx.message || ctx.message.from?.is_bot) return;

  const text = ctx.message.text?.toLowerCase() || "";

  // 1. קללות
  const cursed = await handleCurses(ctx, text);
  if (cursed) {
    console.log("🔺 הופעלה תגובת קללה!");
    return;
  }

  // 2. טריגרים
  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) {
    console.log("🔺 הופעל טריגר!");
    return;
  }

  // 3. תגובה חכמה
  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) {
    console.log("🟢 הופעלה תגובה חכמה!");
    return;
  }
  // DEBUG – אם כלום לא הופעל
  console.log("ℹ️ לא הופעלה שום תגובה.");
});

// ⏰ תזכורת שקט אוטומטית כל 10 דק'
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000);

// 🌐 Webhook ל־Railway – אינטגרציה 100%
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";

  // *** הכי חשוב – אין express.json! ***
  // רק למסלול הספציפי של הטלגרם מוסיפים את ה־webhookCallback
  app.use(path, webhookCallback(bot, "express"));

  // Webhook טלגרם נרשם
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

  // 🎉 ברכות יומולדת – כל יום ב־09:00 (זמן שרת!)
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

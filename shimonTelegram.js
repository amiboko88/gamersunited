// 📁 shimonTelegram.js – הגרסה היציבה ל־Railway + Grammy Webhook + Route בריאות, כולל לוגים מתקדמים

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

bot.use(async (ctx, next) => {
  ctx.db = db;
  await next();
});

// רישום Slash Commands וכל אינטראקציה
registerCommands(bot);
registerBirthdayHandler(bot);

// DEBUG Route – HEALTHCHECK
const app = express();
const path = "/telegram";

// בדיקת בריאות (Health Check)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "✅ Express פועל! בוט טלגרם מאזין תקין",
    time: new Date().toISOString()
  });
});

// *** הכי חשוב: אין express.json! ***
// רק למסלול הטלגרם מוסיפים webhookCallback
app.use(path, webhookCallback(bot, "express"));

// לוג בכל event – DEBUG מלא
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

  // אם כלום לא הופעל
  console.log("ℹ️ לא הופעלה שום תגובה.");
});

// ⏰ תזכורת שקט אוטומטית כל 10 דקות
setInterval(() => {
  checkDailySilence(bot, process.env.TELEGRAM_CHAT_ID);
}, 10 * 60 * 1000);

// 🌐 Webhook ל־Railway – אינטגרציה 100%
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
    console.log("🌡️ בדיקת בריאות זמינה ב־/ (root) – פתח את הדפדפן לכתובת שלך לבדוק תקינות.");
  });

  // 🎉 ברכות יומולדת – כל יום ב־09:00 (זמן שרת)
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

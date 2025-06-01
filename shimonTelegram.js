require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger } = require("./telegramTriggers");
const handleSmartReply = require("./shimonSmart");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 📌 רישום Slash Commands מוקדם
registerCommands(bot);

// 🧠 מאזן הודעות טקסט (כולל Slash וגם רגיל!)
bot.on("message", async (ctx) => {
  const text = ctx.message.text || "";
  console.log("📥 התקבלה הודעה:", text);

  if (text.startsWith("/")) return;

  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

  // החזרת שמעון החכם
  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) return;

  // Fallback — למקרה שלא הופעלה תגובה
  await ctx.reply("שמעון כאן ועונה!");
});




// 🌐 webhook ל־Railway
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";
  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 מאזין לטלגרם בפורט ${port}`);
  });
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL");
}

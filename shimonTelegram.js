require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 📌 רישום Slash Commands מוקדם
registerCommands(bot);

// 🧠 מאזן הודעות טקסט (כולל Slash וגם רגיל!)
bot.on("message", async (ctx) => {
  const text = ctx.message.text || "";
  console.log("📥 התקבלה הודעה:", text);

  if (text.startsWith("/")) {
    console.log("⚙️ Slash Command – לא מגיב כאן");
    return;
  }

  // נסה קודם קללות
  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  // טריגר
  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

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

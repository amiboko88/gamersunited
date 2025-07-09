// 📁 telegram/shimonTelegram.js
require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const { analyzeTextForRoast, registerRoastButtons } = require("./roastTelegram");
const db = require("../utils/firebase");
const registerCommands = require("./telegramCommands");
const { registerBirthdayHandler, validateBirthday, saveBirthday } = require("./telegramBirthday");
const { updateXP, handleTop, registerTopButton } = require("./telegramLevelSystem");
const handleSmartReply = require("./shimonSmart");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");
const { isSpam } = require("./antiSpam");
const { triggerWords } = require("./smartKeywords");


const WAITING_USERS = new Map();
const bot = new Bot(process.env.TELEGRAM_TOKEN);

registerCommands(bot, WAITING_USERS);
registerBirthdayHandler(bot, WAITING_USERS);
handleTop(bot);
registerTopButton(bot);
registerRoastButtons(bot);

bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add");
  await ctx.reply("שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
});

bot.on("message", async (ctx) => {;
  const userId = ctx.from.id;
  const text = ctx.message.text?.trim() || "";
  const isSticker = !!ctx.message.sticker;

  if (await isSpam(ctx)) return;


  if (WAITING_USERS.has(userId)) {
    const mode = WAITING_USERS.get(userId);
    if (["ביטול", "בטל", "cancel"].includes(text.toLowerCase())) {
      WAITING_USERS.delete(userId);
      return ctx.reply("ביטלת עדכון יום הולדת. אפשר תמיד לנסות שוב דרך /birthday 🎂");
    }
    if (mode === "add") {
      const bday = validateBirthday(text);
      if (!bday) {
        return ctx.reply("זה לא תאריך תקין. שלח תאריך כמו 28.06.1993, או 'ביטול' לביטול.");
      }
      try {
        await saveBirthday(ctx.from, bday);
        await ctx.reply("נשמר! מחכה לחגוג איתך – צפה לצלייה קולית משמעון 🎉");
      } catch (err) {
        console.error("❌ שגיאה בשמירת יום הולדת:", err);
        await ctx.reply("משהו נדפק, נסה שוב מאוחר יותר 😵");
      } finally {
        WAITING_USERS.delete(userId);
      }
      return;
    }
    return;
  }

  if (text.startsWith("/") || isSticker || !text || /^[\p{Emoji}]+$/u.test(text)) return;

  const roast = await analyzeTextForRoast(text);
  if (roast) return await ctx.reply(roast, { parse_mode: "HTML" });

const smart = await handleSmartReply(ctx);

// אם לא הופעלה תגובה חכמה – נבדוק האם ההודעה ראויה ל־XP
if (!smart) {
  const cleaned = text.trim();
  const onlyEmoji = /^[\p{Emoji}\s]+$/u.test(cleaned);
  const isShort = cleaned.length < 3;
  const isTrigger = triggerWords.some(w => cleaned.toLowerCase().includes(w));

  if (!onlyEmoji && !isShort && !isTrigger) {
    await updateXP({
      id: ctx.from.id,
      first_name: ctx.from.first_name,
      username: ctx.from.username,
      text: cleaned
    }, ctx);
  }
}

});

// 💡 בלוק התזמון של ימי ההולדת הוסר מכאן. הוא ינוהל על ידי botLifecycle.js

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
require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");

const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger } = require("./telegramTriggers");
const handleSmartReply = require("./shimonSmart");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");

const WAITING_USERS = new Map(); // userId -> "add" | "delete_confirm"

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// 📌 פקודות סלאש
registerCommands(bot);

// 📅 פקודת /birthday פותחת תהליך
bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add");
  await ctx.reply("שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
});

// 🧠 מאזן הודעות טקסט (הכל בפנים)
bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text?.trim() || "";

  // ===== ניהול יום הולדת =====
  if (WAITING_USERS.has(userId)) {
    const mode = WAITING_USERS.get(userId);

    // ביטול
    if (["ביטול", "בטל", "cancel"].includes(text.toLowerCase())) {
      WAITING_USERS.delete(userId);
      await ctx.reply("ביטלת עדכון יום הולדת. אפשר תמיד לנסות שוב דרך /birthday 🎂");
      return;
    }

    // הוספת יום הולדת
    if (mode === "add") {
      const bday = validateBirthday(text);
      if (!bday) {
        await ctx.reply("זה לא תאריך תקין. שלח תאריך כמו 28.06.1993, או 'ביטול' לביטול.");
        return;
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
    // אפשר להוסיף future: delete_confirm וכו'
    return;
  }

  // ===== שאר פיצ'רים רגילים =====
  if (text.startsWith("/")) return;

  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) return;

  await ctx.reply("שמעון כאן ועונה!");
});

// 🎂 ברכות יומיות ב־9:00
const now = new Date();
const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
setTimeout(() => {
  sendBirthdayMessages();
  setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
}, Math.max(millisUntilNine, 0));

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

// ===== עזרי יום הולדת (פשוטים) =====

function validateBirthday(input) {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [_, day, month, year] = match.map(Number);
  const now = new Date();
  const age = now.getFullYear() - year;
  if (age < 10 || age > 100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year, age };
}

async function saveBirthday(user, bday) {
  const doc = {
    birthday: {
      day: bday.day,
      month: bday.month,
      year: bday.year,
      age: bday.age
    },
    fullName: user.first_name || "חבר",
    addedBy: "telegram",
    createdAt: Date.now()
  };
  await db.collection("birthdays").doc(user.id.toString()).set(doc, { merge: true });
}

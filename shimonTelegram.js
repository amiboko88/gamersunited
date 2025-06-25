require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const { analyzeTextForRoast } = require("./roastTelegram");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { registerBirthdayHandler, validateBirthday, saveBirthday } = require("./telegramBirthday");
const { handleCurses } = require("./telegramCurses");
const { handleTrigger } = require("./telegramTriggers");
const { updateXP, handleTop, registerTopButton } = require("./telegramLevelSystem");
const handleSmartReply = require("./shimonSmart");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");

const WAITING_USERS = new Map(); // userId -> מצב הזנה
const bot = new Bot(process.env.TELEGRAM_TOKEN);

registerCommands(bot, WAITING_USERS);
registerBirthdayHandler(bot, WAITING_USERS);
handleTop(bot);
registerTopButton(bot);

// 📌 דיאלוג בין משתתפים
const activeDialog = {
  users: new Set(),
  timeout: null,
};

// 📌 שמירת הודעות אחרונות לגילוי ספאם
const lastMessagesMap = new Map();
const spamCountMap = new Map();

// 📌 תגובות fallback אם אין טריגר/קללה/חוכמה
const fallbackReplies = [
  "יאללה, תתאמץ — שמעון לא מגיב להודעות חלשות.",
  "זה כל מה שיש לך? אכזבה.",
  "תחזור כשתהיה לך שאלה אמיתית.",
  "אני לא רובוט לתשובות סתמיות, אחי.",
  "אפילו יוגי לא היה מגיב לזה.",
];

// 🎂 /birthday
bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add");
  await ctx.reply("שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
});
bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text?.trim() || "";
  const isSticker = !!ctx.message.sticker;

  // 🎂 מצב הזנת יום הולדת
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

  // ❌ התעלמות מפקודות, סטיקרים, אמוג'ים, הודעות קצרות
  if (text.startsWith("/") || isSticker || !text || text.length < 2 || /^[\p{Emoji}]+$/u.test(text)) return;

  // 🔁 זיהוי הודעה חוזרת
  const lastMsg = lastMessagesMap.get(userId) || "";
  if (lastMsg === text) {
    const spamCount = (spamCountMap.get(userId) || 0) + 1;
    spamCountMap.set(userId, spamCount);
    if (spamCount >= 3) {
      return ctx.reply("שמעון מזהיר: להדביק שוב ושוב את אותו דבר? לא חכם. 😤");
    }
    return;
  } else {
    lastMessagesMap.set(userId, text);
    spamCountMap.set(userId, 0);
  }

  // 🧠 תיוג לפי שם
  const mention = checkNameTags(text);
  if (mention) {
    await ctx.reply(`👀 נראה שאתה מדבר על ${mention}`, { parse_mode: "HTML" });
  }

  // ☣️ קללות, טריגרים, תגובות חכמות
  const cursed = await handleCurses(ctx, text.toLowerCase());
  if (cursed) return;

  const triggerResult = handleTrigger(ctx);
  if (triggerResult.triggered) return;

  const smart = await handleSmartReply(ctx, triggerResult);
  if (smart) return;

  // 🤝 שיחה בין שניים ומעלה
  activeDialog.users.add(userId);
  if (activeDialog.timeout) clearTimeout(activeDialog.timeout);

  if (activeDialog.users.size >= 2) {
    activeDialog.timeout = setTimeout(async () => {
      const users = Array.from(activeDialog.users)
        .map((id) => `<a href="tg://user?id=${id}">👤</a>`)
        .join(" ");

      const count = activeDialog.users.size;
      const reactions = {
        2: "דו־שיח מיותר... לכו תתכתבו בפרטי.",
        3: "שיח משולש שלא הוביל לכלום. בזבוז ביטים.",
        4: "יותר מדי דעות, אפס מסקנות. יאללה ביי.",
      };
      const message = reactions[count] || "קבוצת חפירות ברמה של פייסבוק 2011.";

      await ctx.reply(`${users}\nשמעון קובע: "${message}"`, { parse_mode: "HTML" });

      activeDialog.users.clear();
      activeDialog.timeout = null;
    }, 25000);
    return;
  }

  // 🎮 XP ורמות – כולל צבירה והודעה
  const { leveledUp, addedXp } = await updateXP({
    id: ctx.from.id,
    first_name: ctx.from.first_name,
    username: ctx.from.username,
    text
  });

  if (addedXp > 0) {
    let msg = `🆙 +${addedXp} XP`;
    if (leveledUp) {
      msg += `\n🎉 <b>${ctx.from.first_name}</b> עלה לרמה <b>${leveledUp}</b>!`;
    }
    await ctx.reply(msg, { parse_mode: "HTML" });
  }

  // 🧱 fallback אקראי
  await ctx.reply(
    fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)]
  );
});

// 🎂 שליחת ברכות יומיות בשעה 9:00
const now = new Date();
const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
setTimeout(() => {
  sendBirthdayMessages();
  setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
}, Math.max(millisUntilNine, 0));

// 🌐 Webhook ל־Railway
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

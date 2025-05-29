// 📁 telegramBirthday.js – עדכון יום הולדת בטלגרם עם Inline + Firestore

const { InlineKeyboard } = require("grammy");
const db = require("./utils/firebase");

const WAITING_USERS = new Map(); // userId → true

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

module.exports = function registerBirthdayHandler(bot) {
  // /birthday – שולח כפתור
  bot.command("birthday", async (ctx) => {
    const name = ctx.from?.first_name || "חבר";
    const keyboard = new InlineKeyboard().text("📅 עדכן תאריך יום הולדת", "update_birthday");

    await ctx.reply(
      `🎂 ${name}, בא לי לדעת מתי יום ההולדת שלך – רוצה לפרגן בזמן 🎁`,
      { reply_markup: keyboard }
    );
  });

  // כפתור לחיצה
  bot.callbackQuery("update_birthday", async (ctx) => {
    const userId = ctx.from.id;
    WAITING_USERS.set(userId, true);

    await ctx.answerCallbackQuery();
    await ctx.reply(
      "📆 שלח את תאריך יום ההולדת שלך בפורמט: 28.06.1993"
    );
  });

  // מאזין להודעות תאריך
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    if (!WAITING_USERS.has(userId)) return;

    const input = ctx.message.text.trim();
    const bday = validateBirthday(input);

    if (!bday) {
      await ctx.reply("❌ פורמט לא תקין או גיל לא הגיוני. נסה שוב: 28.06.1993");
      return;
    }

    try {
      await saveBirthday(ctx.from, bday);
      await ctx.reply(`🥳 זכרתי. אם לא תקבל ברכה – תדע מי אשם 😉`);
    } catch (err) {
      console.error("❌ שגיאה בשמירת יום הולדת:", err);
      await ctx.reply("😵 משהו השתבש, נסה שוב אחר כך.");
    } finally {
      WAITING_USERS.delete(userId);
    }
  });
};

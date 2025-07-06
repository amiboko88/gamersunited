// 📁 telegramBirthday.js – ניהול ימי הולדת ללא קונפליקט עם on("message")

const { InlineKeyboard } = require("grammy");
const db = require("../utils/firebase");


// 🧠 אימות תאריך
function validateBirthday(input) {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [_, day, month, year] = match.map(Number);
  const now = new Date();
  const age = now.getFullYear() - year;
  if (age < 10 || age > 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year, age };
}

// 🔄 שמירה למסד
async function saveBirthday(user, bday) {
  const doc = {
    birthday: {
      day: bday.day,
      month: bday.month,
      year: bday.year,
      age: bday.age,
    },
    fullName: user.first_name || "חבר",
    addedBy: "telegram",
    createdAt: Date.now(),
  };
  await db.collection("birthdays").doc(user.id.toString()).set(doc, { merge: true });
}

// 🗑️ מחיקה
async function deleteBirthday(userId) {
  await db.collection("birthdays").doc(userId.toString()).delete();
}

// 🎂 שליפה קיימת
async function getUserBirthday(userId) {
  const doc = await db.collection("birthdays").doc(userId.toString()).get();
  return doc.exists ? doc.data().birthday : null;
}

// 📋 תפריטים וכפתורים
function registerBirthdayHandler(bot, WAITING_USERS) {
  bot.command("birthday", async (ctx) => {
    const name = ctx.from?.first_name || "חבר";
    const keyboard = new InlineKeyboard()
      .text("תפריט ניהול אישי 🧑‍💼", "bday_manage")
      .text("ימי הולדת קרובים 🎉", "show_upcoming_birthdays");
    await ctx.reply(
      `\u200F<b>${name}</b>, תפריט ימי הולדת – עדכון, מחיקה או צפייה.`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  bot.callbackQuery("bday_manage", async (ctx) => {
    const userId = ctx.from.id;
    const oldBirthday = await getUserBirthday(userId);

    let txt;
    const keyboard = new InlineKeyboard();

    if (oldBirthday) {
      txt = `🎂 <b>התאריך שלך:</b> <b>${String(oldBirthday.day).padStart(2, "0")}.${String(oldBirthday.month).padStart(2, "0")}.${oldBirthday.year}</b>\n\nמה תרצה לעשות?`;
      keyboard
        .text("עדכן תאריך 📝", "bday_update")
        .text("מחק יום הולדת ❌", "bday_delete_confirm");
    } else {
      txt = "לא נמצא תאריך יום הולדת שמור.\nמה תרצה לעשות?";
      keyboard.text("הוסף יום הולדת 🎂", "bday_update");
    }

    keyboard.row().text("חזור לתפריט 🔙", "bday_menu_main");
    await ctx.reply(txt, { parse_mode: "HTML", reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_menu_main", async (ctx) => {
    const name = ctx.from?.first_name || "חבר";
    const keyboard = new InlineKeyboard()
      .text("תפריט ניהול אישי 🧑‍💼", "bday_manage")
      .text("ימי הולדת קרובים 🎉", "show_upcoming_birthdays");
    await ctx.reply(
      `\u200F<b>${name}</b>, תפריט ימי הולדת – עדכון, מחיקה או צפייה.`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_update", async (ctx) => {
    WAITING_USERS.set(ctx.from.id, "add");
    await ctx.reply("📆 שלח את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_delete_confirm", async (ctx) => {
    WAITING_USERS.set(ctx.from.id, "delete_confirm");
    const keyboard = new InlineKeyboard()
      .text("מחק סופית ❌", "bday_delete_final")
      .text("ביטול", "bday_manage");
    await ctx.reply("אתה בטוח שתרצה למחוק את יום ההולדת שלך?", { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_delete_final", async (ctx) => {
    await deleteBirthday(ctx.from.id);
    WAITING_USERS.delete(ctx.from.id);
    await ctx.reply("✅ יום ההולדת שלך נמחק מהמערכת.");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("show_upcoming_birthdays", async (ctx) => {
    const text = await getUpcomingBirthdaysText();
    await ctx.reply(text, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });
}

// 📅 תצוגת טופ ימי הולדת (לשימוש מחוץ)
async function getUpcomingBirthdaysText() {
  const snapshot = await db.collection("birthdays").get();
  const now = new Date();
  const todayNum = now.getMonth() * 100 + now.getDate();

  const users = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const { day, month, year } = data.birthday || {};
    if (!day || !month || !year) return;

    let ageNext = now.getFullYear() - year;
    if (now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)) {
      ageNext++;
    }

    let orderNum = (month - 1) * 100 + day;
    if (orderNum < todayNum) orderNum += 1200;

    users.push({
      name: data.fullName || "חבר",
      day, month, year,
      ageNext, orderNum
    });
  });

  users.sort((a, b) => a.orderNum - b.orderNum);
  const top = users.slice(0, 5);

  if (top.length === 0) return "לא נמצאו ימי הולדת קרובים 😢";

  let txt = `🎉 <b>ימי הולדת הקרובים:</b>\n\n━━━━━━━━━━━━━\n`;
  top.forEach((u) => {
    txt += `<b>${u.name}</b> 🎂\n<b>${String(u.day).padStart(2, "0")}.${String(u.month).padStart(2, "0")}</b> 🗓️ | בן <b>${u.ageNext}</b> 🎈\n━━━━━━━━━━━━━\n`;
  });

  return txt.trim();
}

module.exports = {
  registerBirthdayHandler,
  validateBirthday,
  saveBirthday,
  getUpcomingBirthdaysText
};

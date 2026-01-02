// 📁 telegram/telegramBirthday.js - מחובר ל-Unified DB
const { InlineKeyboard } = require("grammy");
const db = require("../utils/firebase");
const { getUserRef } = require("../utils/userUtils"); // ✅ חיבור לתשתית החדשה

// 🧠 אימות תאריך (נשאר זהה)
function validateBirthday(input) {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [_, day, month, year] = match.map(Number);
  const now = new Date();
  const age = now.getFullYear() - year;
  if (age < 10 || age > 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year, age };
}

// 🔄 שמירה למסד המאוחד
async function saveBirthday(user, bday) {
  // שימוש ב-getUserRef עם פלטפורמת 'telegram' כדי למצוא את המשתמש הנכון
  const userRef = await getUserRef(user.id.toString(), 'telegram');
  
  await userRef.set({
    identity: {
        birthday: {
            day: bday.day,
            month: bday.month,
            year: bday.year,
            age: bday.age
        },
        fullName: user.first_name || "חבר", // עדכון שם על הדרך
        telegramId: user.id.toString()
    }
  }, { merge: true });
}

// 🗑️ מחיקה
async function deleteBirthday(userId) {
  const userRef = await getUserRef(userId.toString(), 'telegram');
  // במקום למחוק מסמך, אנחנו מוחקים רק את השדה birthday
  await userRef.update({
      'identity.birthday': db.FieldValue.delete()
  });
}

// 🎮 רישום Handler (ללא שינוי בלוגיקה, רק בקריאות לפונקציות)
function registerBirthdayHandler(bot, WAITING_USERS) {
  bot.callbackQuery("add_birthday", async (ctx) => {
    WAITING_USERS.set(ctx.from.id, "add_birthday_step1");
    await ctx.reply("📅 מתי נולדת? כתוב בפורמט: DD.MM.YYYY (למשל 15.04.1995)");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("delete_birthday", async (ctx) => {
    await deleteBirthday(ctx.from.id);
    await ctx.reply("🗑️ תאריך יום ההולדת הוסר מהמערכת.");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("view_upcoming", async (ctx) => {
    const text = await getUpcomingBirthdaysText();
    await ctx.reply(text, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });
}

// 📅 תצוגת טופ ימי הולדת (סריקה של ה-DB החדש)
async function getUpcomingBirthdaysText() {
  // שים לב: זה סורק את כל המשתמשים שיש להם יום הולדת מוגדר
  // אם ה-DB ענק, עדיף להוסיף אינדקס, אבל ל-100 משתמשים זה כלום זמן.
  const snapshot = await db.collection("users")
    .where("identity.birthday", "!=", null) 
    .get();

  const now = new Date();
  const todayNum = (now.getMonth() + 1) * 100 + now.getDate();

  const users = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    // בדיקה כפולה שהנתונים קיימים במבנה החדש
    const bday = data.identity?.birthday;
    if (!bday || !bday.day) return;

    const { day, month, year } = bday;
    let ageNext = now.getFullYear() - year;
    
    // חישוב גיל ליום הולדת הבא
    if ((now.getMonth() + 1) > month || ((now.getMonth() + 1) === month && now.getDate() >= day)) {
      ageNext++;
    }

    let orderNum = month * 100 + day;
    if (orderNum < todayNum) orderNum += 1200; // דוחף לשנה הבאה

    users.push({
      name: data.identity.displayName || data.identity.fullName || "חבר",
      day, month, year,
      ageNext, orderNum
    });
  });

  users.sort((a, b) => a.orderNum - b.orderNum);
  const top = users.slice(0, 5);

  if (top.length === 0) return "📭 אין ימי הולדת קרובים.";

  let text = "<b>🎉 ימי הולדת קרובים:</b>\n\n";
  top.forEach((u) => {
    const dateStr = `${String(u.day).padStart(2, '0')}.${String(u.month).padStart(2, '0')}`;
    text += `🎂 <b>${u.name}</b> (${dateStr}) – יהיה בן <b>${u.ageNext}</b>\n`;
  });

  return text;
}

module.exports = { registerBirthdayHandler, validateBirthday, saveBirthday, getUpcomingBirthdaysText };
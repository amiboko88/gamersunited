
// 📁 telegramBirthday.js – אינטראקטיבי מלא 2030 – עברית תקינה RTL

const { InlineKeyboard } = require("grammy");
const db = require("./utils/firebase");

const WAITING_USERS = new Map(); // userId -> true

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
  // פקודת /birthday – תפריט אינטראקטיבי
  bot.command("birthday", async (ctx) => {
    const name = ctx.from?.first_name || "חבר";
    const keyboard = new InlineKeyboard()
      .text("שלח תאריך יום הולדת 🎂", "update_birthday")
      .text("ימי הולדת קרובים 🎉", "show_upcoming_birthdays");
    await ctx.reply(
      `\u200F<b>${name}</b>, רוצה לקבל ברכה סרקסטית אמיתית ביום ההולדת? עדכן תאריך, או תבדוק למי תצטרך להביא עוגה השנה 🍰`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  // כפתור לשליחת תאריך יום הולדת
  bot.callbackQuery("update_birthday", async (ctx) => {
    const userId = ctx.from.id;
    WAITING_USERS.set(userId, true);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 📅"
    );
  });

  // קבלת תאריך, אימות, שמירה
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    if (!WAITING_USERS.has(userId)) return;

    const input = ctx.message.text.trim();
    const bday = validateBirthday(input);

    if (!bday) {
      await ctx.reply("זה לא תאריך תקין. נסה שוב – 28.06.1993 ❌");
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
  });

  // כפתור – ימי הולדת קרובים (תצוגה RTL ואימוג'ים בסוף)
  bot.callbackQuery("show_upcoming_birthdays", async (ctx) => {
    await ctx.answerCallbackQuery();

    const snapshot = await db.collection("birthdays").get();
    const now = new Date();
    const todayNum = now.getMonth() * 100 + now.getDate();

    const users = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const { day, month, year } = data.birthday || {};
      if (!day || !month || !year) return;

      // גיל הבא – חישוב נכון ל־RTL
      let ageNext;
      if (
        now.getMonth() + 1 > month ||
        (now.getMonth() + 1 === month && now.getDate() >= day)
      ) {
        // כבר חגג השנה – הגיל הבא בשנה הבאה
        ageNext = now.getFullYear() - year + 1;
      } else {
        // טרם חגג השנה – הגיל הבא זה השנה
        ageNext = now.getFullYear() - year;
      }

      let orderNum = (month - 1) * 100 + day;
      if (orderNum < todayNum) orderNum += 1200; // מעבר לשנה הבאה

      users.push({
        name: data.fullName || "חבר",
        day, month, year,
        ageNext, orderNum
      });
    });

    // מיין לפי orderNum
    users.sort((a, b) => a.orderNum - b.orderNum);
    const top = users.slice(0, 5);

    if (top.length === 0) {
      await ctx.reply("לא הוזנו ימי הולדת בקהילה. באסה 😢");
      return;
    }

    let txt = `🎉 <b>ימי הולדת הקרובים:</b>\n\n━━━━━━━━━━━━━\n`;
    top.forEach((u, i) => {
      txt += `<b>${u.name}</b> 🎂\n<b>${String(u.day).padStart(2, "0")}.${String(u.month).padStart(2, "0")}</b> 🗓️ | בן <b>${u.ageNext}</b> 🎈\n━━━━━━━━━━━━━\n`;
    });
    await ctx.reply(txt.trim(), { parse_mode: "HTML" });
  });
};

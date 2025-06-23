// 📁 telegramBirthday.js – תפריט ניהול יום הולדת אישי

const { InlineKeyboard } = require("grammy");
const db = require("./utils/firebase");

function validateBirthday(input) {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [_, day, month, year] = match.map(Number);
  const now = new Date();
  const age = now.getFullYear() - year;
  if (age < 10 || age > 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year, age };
}

async function getUserBirthday(userId) {
  const doc = await db.collection("birthdays").doc(userId.toString()).get();
  return doc.exists ? doc.data().birthday : null;
}

async function saveBirthday(user, bday) {
  const fullName = user.first_name || user.username || "חבר";
  const sourceId = `telegram:${user.id}`;
  const snapshot = await db.collection("birthdays").get();

  let matchedDoc = null;

  snapshot.forEach(doc => {
    const data = doc.data();
    const bd = data.birthday;
    const linked = data.linkedAccounts || [];

    if (
      data.fullName === fullName &&
      bd?.day === bday.day &&
      bd?.month === bday.month &&
      bd?.year === bday.year
    ) {
      matchedDoc = doc;
    }

    if (linked.includes(sourceId)) {
      matchedDoc = doc;
    }
  });

  const newData = {
    birthday: {
      day: bday.day,
      month: bday.month,
      year: bday.year,
      age: bday.age
    },
    fullName,
    addedBy: "telegram",
    createdAt: Date.now()
  };

  if (matchedDoc) {
    const existing = matchedDoc.data();
    const updatedLinks = new Set(existing.linkedAccounts || []);
    updatedLinks.add(sourceId);

    await matchedDoc.ref.update({
      ...newData,
      linkedAccounts: Array.from(updatedLinks)
    });
    console.log(`🎯 עודכן קיים: ${matchedDoc.id}`);
  } else {
    await db.collection("birthdays").doc(user.id.toString()).set({
      ...newData,
      linkedAccounts: [sourceId]
    });
    console.log(`🎉 נוצר חדש: ${user.id}`);
  }
}

async function deleteBirthday(userId) {
  await db.collection("birthdays").doc(userId.toString()).delete();
}

module.exports = function registerBirthdayHandler(bot, WAITING_USERS) {
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
    const userId = ctx.from.id;
    WAITING_USERS.set(userId, "add");
    await ctx.reply("📆 שלח את תאריך יום ההולדת שלך בפורמט 28.06.1993\nאו כתוב 'ביטול' לביטול.");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_delete_confirm", async (ctx) => {
    const userId = ctx.from.id;
    WAITING_USERS.set(userId, "delete_confirm");
    const keyboard = new InlineKeyboard()
      .text("מחק סופית ❌", "bday_delete_final")
      .text("ביטול", "bday_manage");
    await ctx.reply("האם למחוק את תאריך יום ההולדת שלך מהמערכת?", { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("bday_delete_final", async (ctx) => {
    const userId = ctx.from.id;
    await deleteBirthday(userId);
    WAITING_USERS.delete(userId);
    await ctx.reply("נמחק ❌ יום ההולדת שלך נמחק מהמערכת.");
    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    if (!WAITING_USERS.has(userId)) return;

    const mode = WAITING_USERS.get(userId);
    const input = ctx.message.text.trim();

    if (["ביטול", "בטל", "cancel"].includes(input.toLowerCase())) {
      WAITING_USERS.delete(userId);
      await ctx.reply("בוטל 🎂 אפשר תמיד לנסות שוב דרך /birthday.");
      return;
    }

    if (mode === "add") {
      const bday = validateBirthday(input);
      if (!bday) {
        await ctx.reply("📛 תאריך לא תקין. שלח תאריך כמו 28.06.1993 או 'ביטול'.");
        return;
      }
      const oldBirthday = await getUserBirthday(userId);
      if (oldBirthday &&
          oldBirthday.day === bday.day &&
          oldBirthday.month === bday.month &&
          oldBirthday.year === bday.year) {
        await ctx.reply("⚠️ זה כבר התאריך השמור שלך.");
        WAITING_USERS.delete(userId);
        return;
      }
      try {
        await saveBirthday(ctx.from, bday);
        await ctx.reply("🎉 נשמר! מחכה לצלייה קולית משמעון.");
      } catch (err) {
        console.error("❌ שגיאה בשמירת יום הולדת:", err);
        await ctx.reply("😵 משהו נדפק. נסה שוב מאוחר יותר.");
      } finally {
        WAITING_USERS.delete(userId);
      }
    }

    if (mode === "delete_confirm") {
      await ctx.reply("אם התחרטת, לחץ על 'ביטול' או 'חזור לתפריט' 👈");
    }
  });

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

    if (top.length === 0) {
      await ctx.reply("לא נמצאו ימי הולדת קרובים 😢");
      return;
    }

    let txt = `🎉 <b>ימי הולדת הקרובים:</b>\n\n━━━━━━━━━━━━━\n`;
    top.forEach((u) => {
      txt += `<b>${u.name}</b> 🎂\n<b>${String(u.day).padStart(2, "0")}.${String(u.month).padStart(2, "0")}</b> 🗓️ | בן <b>${u.ageNext}</b> 🎈\n━━━━━━━━━━━━━\n`;
    });

    await ctx.reply(txt.trim(), { parse_mode: "HTML" });
  });
};

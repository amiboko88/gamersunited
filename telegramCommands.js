// 📁 telegramCommands.js – גרסה 2030: /start אינטראקטיבי חכם, תפריט inline מלא

const replies = require("./commandsData");

module.exports = function registerTelegramCommands(bot) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";
  const idOf = (ctx) => ctx.from?.id?.toString() || "";

  // 📌 רישום פקודות עיקריות בלבד
  bot.api.setMyCommands([
    { command: "start", description: "🚀 התחלה וברוך הבא" },
    { command: "help", description: "🆘 תפריט פקודות וקטגוריות" },
    { command: "birthday", description: "🎂 הוסף או עדכן יום הולדת" }
  ]).catch((err) => {
    console.error("❌ שגיאה ברישום פקודות בטלגרם:", err);
  });

  // 🟢 תפריט Menu קבוע ב־Telegram (מציג Slash Commands)
  bot.api.setChatMenuButton({
    menu_button: { type: "commands" }
  }).then(() => {
    console.log("📎 Menu Button הוגדר בהצלחה");
  }).catch(console.error);

  // 🟢 /start אינטראקטיבי – תפריט מונפש וחכם
  bot.command("start", async (ctx) => {
    const name = nameOf(ctx);
    const userId = idOf(ctx);

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🧑‍💼 פרופיל אישי", callback_data: `start_profile_${userId}` },
          { text: "🎉 ימי הולדת קרובים", callback_data: "show_upcoming_birthdays" }
        ],
        [
          { text: "📜 תפריט פקודות", callback_data: "help_system" }
        ]
      ]
    };

    await ctx.reply(
      `\u200F<b>ברוך הבא ל־UNITED IL!</b>\n\n`
      + `אני <b>שמעון הבוט</b> – גיימר עם הפה הכי גדול בדיסקורד ובטלגרם.\n`
      + `מוכן לצחוק, להעליב, לייעץ, להפתיע ולעקוץ (בעיקר את יוגי).\n\n`
      + `🏆 <b>פיצ'רים עיקריים:</b>\n`
      + `• תפריט פקודות מהיר\n`
      + `• מערכת ימי הולדת חכמה\n`
      + `• פרופיל אישי לכל אחד\n`
      + `• צלייה קבוצתית, ירידות, בדיחות, MVP ועוד\n\n`
      + `<i>התחל כאן 👇</i>`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  // 👤 תפריט פרופיל אישי מתוך /start (editMessageText)
  bot.callbackQuery(/start_profile_(\d+)/, async (ctx) => {
    const reqId = ctx.match[1];
    const userId = ctx.from.id.toString();
    if (reqId !== userId) {
      await ctx.answerCallbackQuery({ text: "זה לא הפרופיל שלך!", show_alert: true });
      return;
    }
    const db = ctx.db || require("./utils/firebase");
    const doc = await db.collection("birthdays").doc(userId).get();
    let txt = `👤 <b>פרופיל אישי – ${ctx.from.first_name || "חבר"}</b>\n`;
    if (doc.exists && doc.data().birthday) {
      const b = doc.data().birthday;
      txt += `\n• <b>יום הולדת:</b> ${String(b.day).padStart(2,"0")}.${String(b.month).padStart(2,"0")}.${b.year}\n`;
      // חישוב הגיל הבא
      const now = new Date();
      let nextAge;
      if (
        now.getMonth() + 1 > b.month ||
        (now.getMonth() + 1 === b.month && now.getDate() >= b.day)
      ) {
        nextAge = now.getFullYear() - b.year + 1;
      } else {
        nextAge = now.getFullYear() - b.year;
      }
      txt += `• <b>הגיל הבא:</b> ${nextAge}\n`;
    } else {
      txt += `\nעדיין לא הגדרת תאריך יום הולדת 🎂`;
    }
    txt += `\n\n• <b>MVP האחרון:</b> לא פורסם (עוד רגע אצל שמעון)\n• <b>הכי הרבה קללות:</b> קלי\n\n<b>פיצ'רים נוספים בתפריט:</b>`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🎂 עדכן יום הולדת", callback_data: "bday_update" }
        ],
        [
          { text: "📜 תפריט פקודות", callback_data: "help_system" },
          { text: "🔙 חזור להתחלה", callback_data: "start_home" }
        ]
      ]
    };
    try {
      await ctx.editMessageText(txt, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (e) {
      await ctx.reply(txt, { parse_mode: "HTML", reply_markup: keyboard });
    }
    await ctx.answerCallbackQuery();
  });

  // חזרה למסך ראשי של start
  bot.callbackQuery("start_home", async (ctx) => {
    const name = nameOf(ctx);
    const userId = idOf(ctx);

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🧑‍💼 פרופיל אישי", callback_data: `start_profile_${userId}` },
          { text: "🎉 ימי הולדת קרובים", callback_data: "show_upcoming_birthdays" }
        ],
        [
          { text: "📜 תפריט פקודות", callback_data: "help_system" }
        ]
      ]
    };

    try {
      await ctx.editMessageText(
        `\u200F<b>ברוך הבא ל־UNITED IL!</b>\n\n`
        + `אני <b>שמעון הבוט</b> – גיימר עם הפה הכי גדול בדיסקורד ובטלגרם.\n`
        + `מוכן לצחוק, להעליב, לייעץ, להפתיע ולעקוץ (בעיקר את יוגי).\n\n`
        + `🏆 <b>פיצ'רים עיקריים:</b>\n`
        + `• תפריט פקודות מהיר\n`
        + `• מערכת ימי הולדת חכמה\n`
        + `• פרופיל אישי לכל אחד\n`
        + `• צלייה קבוצתית, ירידות, בדיחות, MVP ועוד\n\n`
        + `<i>התחל כאן 👇</i>`,
        { parse_mode: "HTML", reply_markup: keyboard }
      );
    } catch (e) {
      await ctx.reply(
        `\u200F<b>ברוך הבא ל־UNITED IL!</b>\n\n`
        + `אני <b>שמעון הבוט</b> – גיימר עם הפה הכי גדול בדיסקורד ובטלגרם.\n`
        + `מוכן לצחוק, להעליב, לייעץ, להפתיע ולעקוץ (בעיקר את יוגי).\n\n`
        + `🏆 <b>פיצ'רים עיקריים:</b>\n`
        + `• תפריט פקודות מהיר\n`
        + `• מערכת ימי הולדת חכמה\n`
        + `• פרופיל אישי לכל אחד\n`
        + `• צלייה קבוצתית, ירידות, בדיחות, MVP ועוד\n\n`
        + `<i>התחל כאן 👇</i>`,
        { parse_mode: "HTML", reply_markup: keyboard }
      );
    }
    await ctx.answerCallbackQuery();
  });

  // 🟢 /help אינטראקטיבי – Inline Keyboard לקטגוריות
  bot.command("help", async (ctx) => {
    const name = nameOf(ctx);

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🎮 גיימינג וירידות", callback_data: "help_gaming" },
          { text: "🧠 פסיכולוגיה של שמעון", callback_data: "help_psy" }
        ],
        [
          { text: "🎉 פאן ובדיחות", callback_data: "help_fun" },
          { text: "📅 ימי הולדת", callback_data: "help_birthday" }
        ],
        [
          { text: "🛠️ מערכת", callback_data: "help_system" }
        ]
      ]
    };

    await ctx.reply(
      `\u200F<b>${name}</b>, תפריט פקודות חכם – בחר קטגוריה:\n\n`
      + `שמעון הבוט 2030: אינטראקטיבי, קטלני, ומצחיק.`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  // 🟢 תגובה לכל כפתור Help – מציג רשימת פקודות בקטגוריה
  const helpSections = {
    help_gaming: `
<b>🎮 גיימינג וירידות</b>
/roast_me – צלייה אישית
/insult – העלבה ישירה
/compliment – מחמאה סרקסטית
/excuse – תירוץ מביך
/rage – התפרצות זעם
/punishment – עונש על ביצועים
    `.trim(),

    help_psy: `
<b>🧠 פסיכולוגיה של שמעון</b>
/prophecy – תחזית פסימית
/why – למה אתה גרוע?
/shimon – משפט השראה מרושע
/honest – אמת כואבת
/toxic – רמת טוקסיות
/status – מצב FIFO
/nextmvp – ניחוש MVP
    `.trim(),

    help_fun: `
<b>🎉 פאן ובדיחות</b>
/joke – בדיחה גרועה
/sound – צליל FIFO דמיוני
/yogi – משפטי יוגי
/daily – משפט יומי
/legend – גיימר אגדי
    `.trim(),

    help_birthday: `
<b>📅 ימי הולדת</b>
/birthday – הוסף או עדכן יום הולדת (עם כפתור)
    `.trim(),

    help_system: `
<b>🛠️ מערכת</b>
/start – התחלה וברוך הבא
/help – תפריט זה
    `.trim()
  };

  bot.callbackQuery(/help_/, async (ctx) => {
    const section = ctx.callbackQuery.data;
    if (helpSections[section]) {
      await ctx.answerCallbackQuery();
      await ctx.reply(helpSections[section], { parse_mode: "HTML" });
    } else {
      await ctx.answerCallbackQuery("לא נמצא מידע לקטגוריה זו.", { show_alert: true });
    }
  });

  // 🧠 פקודות רגילות – לשמור כמו בישן! (אפשר להוסיף/להוריד פקודות לפי הצורך)

  bot.command("prophecy", (ctx) => {
    const { text, options } = format(ctx, replies.prophecy);
    ctx.reply(text, options);
  });

  bot.command("laugh", (ctx) => {
    const { text, options } = format(ctx, replies.laugh);
    ctx.reply(text, options);
  });

  bot.command("compliment", (ctx) => {
    const { text, options } = format(ctx, replies.compliment);
    ctx.reply(text, options);
  });

  bot.command("nextmvp", (ctx) => {
    const { text, options } = format(ctx, replies.nextmvp);
    ctx.reply(text, options);
  });

  bot.command("why", (ctx) => {
    const { text, options } = format(ctx, replies.why);
    ctx.reply(text, options);
  });

  bot.command("shimon", (ctx) => {
    const { text, options } = format(ctx, replies.shimon);
    ctx.reply(text, options);
  });

  bot.command("excuse", (ctx) => {
    const { text, options } = format(ctx, replies.excuse);
    ctx.reply(text, options);
  });

  bot.command("rage", (ctx) => {
    const { text, options } = format(ctx, replies.rage);
    ctx.reply(text, options);
  });

  bot.command("daily", (ctx) => {
    const { text, options } = format(ctx, replies.daily);
    ctx.reply(text, options);
  });

  bot.command("insult", (ctx) => {
    const { text, options } = format(ctx, replies.insult);
    ctx.reply(text, options);
  });

  bot.command("legend", (ctx) => {
    const { text, options } = format(ctx, replies.legend);
    ctx.reply(text, options);
  });

  bot.command("status", (ctx) => {
    const { text, options } = format(ctx, replies.status);
    ctx.reply(text, options);
  });

  bot.command("roast_me", (ctx) => {
    const { text, options } = format(ctx, replies.roast_me);
    ctx.reply(text, options);
  });

  bot.command("honest", (ctx) => {
    const { text, options } = format(ctx, replies.honest);
    ctx.reply(text, options);
  });

  bot.command("toxic", (ctx) => {
    const { text, options } = format(ctx, replies.toxic);
    ctx.reply(text, options);
  });

  bot.command("yogi", (ctx) => {
    const { text, options } = format(ctx, replies.yogi);
    ctx.reply(text, options);
  });

  bot.command("punishment", (ctx) => {
    const { text, options } = format(ctx, replies.punishment);
    ctx.reply(text, options);
  });

  bot.command("joke", (ctx) => {
    const { text, options } = format(ctx, replies.joke);
    ctx.reply(text, options);
  });

  bot.command("sound", (ctx) => {
    const { text, options } = format(ctx, replies.sound);
    ctx.reply(text, options);
  });

  // 🔧 פורמט אחיד
  function format(ctx, list) {
    const name = nameOf(ctx);
    const text = getRandom(list);
    return {
      text: `\u200F<b>${name}</b> – ${text}`,
      options: { parse_mode: "HTML" }
    };
  }
};

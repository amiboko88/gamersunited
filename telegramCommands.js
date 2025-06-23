// 📁 telegramCommands.js – רישום פקודות ושילוב תפריטים חכמים

const replies = require("./commandsData");
const { getUserLevelCanvas } = require("./telegramLevelSystem");
const { getUpcomingBirthdaysText } = require("./telegramBirthday");
const db = require("./utils/firebase"); // נדרש עבור MVP

module.exports = function registerTelegramCommands(bot, WAITING_USERS) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";
  const idOf = (ctx) => ctx.from?.id?.toString() || "";

  // 📌 פקודת /start
  bot.api.setMyCommands([
    { command: "start", description: "🚀 פתיחת תפריט ראשי" }
  ]);

  // 🎛️ תפריט ראשי
  bot.command("start", async (ctx) => {
    const userId = idOf(ctx);
    await ctx.reply("🎛️ תפריט ראשי של שמעון:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎂 ניהול ימי הולדת", callback_data: "menu_birthdays" },
            { text: "🧑‍💼 פרופיל אישי", callback_data: "menu_profile" }
          ],
          [
            { text: "📚 עזרה והסברים", callback_data: "menu_help" }
          ]
        ]
      }
    });
  });

  // 🎂 תפריט ימי הולדת
  bot.callbackQuery("menu_birthdays", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎉 הוסף/עדכן יום הולדת", callback_data: "bday_update" }],
          [{ text: "📆 ימי הולדת קרובים", callback_data: "show_upcoming_birthdays" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 🧑‍💼 תפריט פרופיל אישי
  bot.callbackQuery("menu_profile", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧬 פרופיל XP", callback_data: "profile_xp" }],
          [{ text: "🏆 טבלת TOP", callback_data: "profile_top" }],
          [{ text: "⭐ MVP מהדיסקורד", callback_data: "profile_mvp" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 🧬 פרופיל XP
  bot.callbackQuery("profile_xp", async (ctx) => {
    const result = await getUserLevelCanvas(bot, ctx.from.id);
    if (!result) return ctx.reply("😕 אין נתונים עדיין. כתוב קצת בצ'אט כדי להתקדם.");

    const { text, photo } = result;
    if (photo) {
      await ctx.replyWithPhoto(photo, {
        caption: text,
        parse_mode: "HTML"
      });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
    await ctx.answerCallbackQuery();
  });

  // ⭐ MVP מדיסקורד
  bot.callbackQuery("profile_mvp", async (ctx) => {
    try {
      const doc = await db.collection("leaderboard").doc("mvp").get();
      if (!doc.exists || !doc.data()?.url) {
        return ctx.reply("🤷‍♂️ אין MVP מעודכן כרגע. חזור מאוחר יותר.");
      }

      const mvpImage = doc.data().url;
      await ctx.replyWithPhoto(mvpImage, {
        caption: "👑 <b>MVP מהשרת בדיסקורד</b>\nהוזן אוטומטית מהלידרבורד האחרון.",
        parse_mode: "HTML"
      });
    } catch (err) {
      console.error("שגיאה בשליפת MVP:", err);
      await ctx.reply("😵 משהו נדפק. נסה שוב מאוחר יותר.");
    }
    await ctx.answerCallbackQuery();
  });

  // 📚 תפריט עזרה
  bot.callbackQuery("menu_help", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "❓ מה שמעון יודע", callback_data: "help_know" }],
          [{ text: "🚫 מה שמעון לא עושה", callback_data: "help_dont" }],
          [{ text: "💬 טריגרים נפוצים", callback_data: "help_triggers" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 🔙 חזרה לתפריט ראשי
  bot.callbackQuery("menu_back", async (ctx) => {
    const userId = idOf(ctx);
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎂 ניהול ימי הולדת", callback_data: "menu_birthdays" },
            { text: "🧑‍💼 פרופיל אישי", callback_data: "menu_profile" }
          ],
          [
            { text: "📚 עזרה והסברים", callback_data: "menu_help" }
          ]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 📆 ימי הולדת קרובים
  bot.callbackQuery("show_upcoming_birthdays", async (ctx) => {
    const text = await getUpcomingBirthdaysText();
    await ctx.reply(text, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });

  // 🎉 הוספת יום הולדת
  bot.callbackQuery("bday_update", async (ctx) => {
    WAITING_USERS.set(ctx.from.id, "add");
    await ctx.reply("📆 שלח תאריך יום הולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
    await ctx.answerCallbackQuery();
  });

  // 📌 תכני עזרה לכל כפתור Help
  const helpSections = {
    help_know: `
<b>❓ מה שמעון יודע:</b>
• להעליב ולרדת
• לזהות תיוגים חכמים
• לשלוח ברכות בצחוק
• לנהל XP ולתייג משתמשים מוכרים
`.trim(),

    help_dont: `
<b>🚫 מה שמעון לא עושה:</b>
• לא מחנך
• לא מתנצל
• לא נרדם באמצע שיחה
• לא סופר אותך אם אתה לא כותב
`.trim(),

    help_triggers: `
<b>💬 טריגרים נפוצים:</b>
• "יוגי" – תגובת יוגי
• "פדיחה" – בדיחת פדיחות
• "שמעון" – כניסה אגרסיבית
• "תכנת" – תגובת AI
`.trim()
  };

  bot.callbackQuery(/^help_/, async (ctx) => {
    const key = ctx.callbackQuery.data;
    if (helpSections[key]) {
      await ctx.reply(helpSections[key], { parse_mode: "HTML" });
    } else {
      await ctx.answerCallbackQuery("לא נמצא מידע לקטגוריה זו.", { show_alert: true });
    }
  });

  // 🧠 פקודות רגילות
  const format = (ctx, list) => {
    const name = nameOf(ctx);
    const text = getRandom(list);
    return {
      text: `<b>${name}</b> – ${text} 🎯`,
      options: { parse_mode: "HTML" }
    };
  };

  const commands = [
    "prophecy", "laugh", "compliment", "nextmvp", "why",
    "shimon", "excuse", "rage", "daily", "insult",
    "legend", "status", "roast_me", "honest", "toxic",
    "yogi", "punishment", "joke", "sound"
  ];

  commands.forEach((cmd) => {
    if (replies[cmd]) {
      bot.command(cmd, (ctx) => {
        const { text, options } = format(ctx, replies[cmd]);
        ctx.reply(text, options);
      });
    }
  });
};

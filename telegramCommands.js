// 📁 telegramCommands.js – גרסה 2030: רק פקודות עיקריות + תפריט help חכם ב-Inline

const replies = require("./commandsData");

module.exports = function registerTelegramCommands(bot) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";

  // 📌 רישום רק פקודות עיקריות ב-setMyCommands
  bot.api.setMyCommands([
    { command: "start", description: "🚀 התחלה וברוך הבא" },
    { command: "help", description: "🆘 תפריט פקודות וקטגוריות" },
    { command: "birthday", description: "🎂 הוסף או עדכן יום הולדת" }
  ]).catch((err) => {
    console.error("❌ שגיאה ברישום פקודות בטלגרם:", err);
  });

  // 🟢 כפתור Menu קבוע בצ'אט
  bot.api.setChatMenuButton({
    menu_button: { type: "commands" }
  }).then(() => {
    console.log("📎 Menu Button הוגדר בהצלחה");
  }).catch(console.error);

  // 🧠 פקודות אחת־אחת (לא נגעתי – לשמור את כל הישן כאן!)

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
      `\u200F<b>${name}</b>, תפריט פקודות חכם – בחר קטגוריה:` +
      `\n\nשמעון הבוט 2030: אינטראקטיבי, קטלני, ומצחיק.`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  // 🟢 תגובה לכל כפתור Help – מציג רשימה של פקודות בקטגוריה
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

  // 🔧 פורמט אחיד (כמו תמיד)
  function format(ctx, list) {
    const name = nameOf(ctx);
    const text = getRandom(list);
    return {
      text: `\u200F<b>${name}</b> – ${text}`,
      options: { parse_mode: "HTML" }
    };
  }
};

// 📁 telegramCommands.js – גרסה מלאה, כל פקודה נרשמת במפורש

const replies = require("./commandsData");

module.exports = function registerTelegramCommands(bot) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";

  // 📌 רישום Slash Commands אחד־אחד
  bot.api.setMyCommands([
    { command: "start", description: "התחלה וברוך הבא" },
    { command: "help", description: "הצג את כל האפשרויות של הבוט" },
    { command: "prophecy", description: "קבל תחזית פסימית מהבוט" },
    { command: "laugh", description: "שמעון יורד עליך" },
    { command: "compliment", description: "מחמאה גסה במיוחד" },
    { command: "nextmvp", description: "ניחוש מגוחך של שמעון" },
    { command: "why", description: "למה אני כזה גרוע?" },
    { command: "shimon", description: "משפט השראה מרושע" },
    { command: "excuse", description: "תירוץ מביך להפסד שלך" },
    { command: "rage", description: "התפרצות זעם של גיימר מתוסכל" },
    { command: "daily", description: "משפט יומי אכזרי משמעון" },
    { command: "insult", description: "העלבה ישירה" },
    { command: "legend", description: "כבוד לגיימר מיתולוגי" },
    { command: "status", description: "מצב חברתי אכזרי" },
    { command: "roast_me", description: "צלייה אישית" },
    { command: "honest", description: "אמת כואבת" },
    { command: "toxic", description: "מצב טוקסיות" },
    { command: "yogi", description: "משפטי יוגי" },
    { command: "punishment", description: "עונש על ביצועים חלשים" },
    { command: "joke", description: "בדיחה גרועה במיוחד" },
    { command: "sound", description: "צליל FIFO מדומיין" }
  ]).catch((err) => {
    console.error("❌ שגיאה ברישום פקודות בטלגרם:", err);
  });

  // 🧠 פקודות אחת־אחת
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

  // 🆘 /help
  bot.command("help", (ctx) => {
    const name = nameOf(ctx);
    const list = `
/prophecy – תחזית פסימית
/laugh – ירידה אכזרית
/compliment – מחמאה סרקסטית
/nextmvp – ניחוש MVP
/why – למה אתה גרוע
/shimon – משפט השראה
/excuse – תירוץ מביך
/rage – התפרצות זעם
/daily – משפט יומי
/insult – העלבה
/legend – גיימר אגדי
/status – מצב FIFO
/roast_me – צלייה
/honest – אמת כואבת
/toxic – רעל
/yogi – משפטי יוגי
/punishment – עונש
/joke – בדיחה גרועה
/sound – סאונד דמיוני
    `.trim();
    ctx.reply(`\u200F<b>${name}</b>, שמעון יודע לעשות את הדברים הבאים:\n\n${list}`, { parse_mode: "HTML" });
  });

  // 🚀 /start
  bot.command("start", (ctx) => {
    const name = nameOf(ctx);
    ctx.reply(`\u200F<b>${name}</b>, ברוך הבא לשמעון הבוט. הקלד /help כדי לראות מה אני יודע לעשות 🤖`, { parse_mode: "HTML" });
  });

  // 🔧 פורמט אחיד
function format(ctx, list) {
  const name = nameOf(ctx); // שולף את שם המשתמש או "חבר"
  const text = getRandom(list); // בוחר משפט רנדומלי מהמאגר
  return {
    text: `\u200F<b>${name}</b> – ${text}`, // טקסט מעוצב עם RTL
    options: { parse_mode: "HTML" } // הגדרה לתמיכה בעיצוב
  };
}

};

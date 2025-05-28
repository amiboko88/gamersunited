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
  bot.command("prophecy", (ctx) => ctx.reply(format(ctx, replies.prophecy)));
  bot.command("laugh", (ctx) => ctx.reply(format(ctx, replies.laugh)));
  bot.command("compliment", (ctx) => ctx.reply(format(ctx, replies.compliment)));
  bot.command("nextmvp", (ctx) => ctx.reply(format(ctx, replies.nextmvp)));
  bot.command("why", (ctx) => ctx.reply(format(ctx, replies.why)));
  bot.command("shimon", (ctx) => ctx.reply(format(ctx, replies.shimon)));
  bot.command("excuse", (ctx) => ctx.reply(format(ctx, replies.excuse)));
  bot.command("rage", (ctx) => ctx.reply(format(ctx, replies.rage)));
  bot.command("daily", (ctx) => ctx.reply(format(ctx, replies.daily)));
  bot.command("insult", (ctx) => ctx.reply(format(ctx, replies.insult)));
  bot.command("legend", (ctx) => ctx.reply(format(ctx, replies.legend)));
  bot.command("status", (ctx) => ctx.reply(format(ctx, replies.status)));
  bot.command("roast_me", (ctx) => ctx.reply(format(ctx, replies.roast_me)));
  bot.command("honest", (ctx) => ctx.reply(format(ctx, replies.honest)));
  bot.command("toxic", (ctx) => ctx.reply(format(ctx, replies.toxic)));
  bot.command("yogi", (ctx) => ctx.reply(format(ctx, replies.yogi)));
  bot.command("punishment", (ctx) => ctx.reply(format(ctx, replies.punishment)));
  bot.command("joke", (ctx) => ctx.reply(format(ctx, replies.joke)));
  bot.command("sound", (ctx) => ctx.reply(format(ctx, replies.sound)));

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
  const name = nameOf(ctx);
  const text = getRandom(list);
  return {
    text: `\u200F<b>${name}</b> – ${text}`,
    options: { parse_mode: "HTML" }
  };
}
};

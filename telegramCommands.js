// telegramCommands.js

module.exports = function registerTelegramCommands(bot) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";

  const prophecies = [...]; // כל התכנים שהיו – השאר כפי שהוא
  const laughs = [...];
  const compliments = [...];
  const mvpPredictions = [...];
  const excuses = [...];
  const rages = [...];
  const dailyLines = [...];
  const insults = [...];
  const shimonQuotes = [...];

  // 🔁 רישום Slash Commands לתוך Telegram
  bot.api.setMyCommands([
    { command: "start", description: "התחלה וברוך הבא" },
    { command: "prophecy", description: "קבל תחזית פסימית מהבוט" },
    { command: "laugh", description: "שמעון יורד עליך" },
    { command: "compliment", description: "מחמאה גסה במיוחד" },
    { command: "nextmvp", description: "ניחוש מגוחך של שמעון" },
    { command: "why", description: "למה אני כזה גרוע?" },
    { command: "shimon", description: "משפט השראה מרושע" },
    { command: "excuse", description: "תירוץ מביך להפסד שלך" },
    { command: "rage", description: "התפרצות זעם של גיימר מתוסכל" },
    { command: "daily", description: "משפט יומי אכזרי משמעון" },
    { command: "help", description: "הצג את כל האפשרויות של הבוט" }
  ]).then(() => {
    console.log("✅ פקודות Telegram נרשמו בהצלחה");
  }).catch((err) => {
    console.error("❌ שגיאה ברישום פקודות Telegram:", err);
  });

  // Start
  bot.command("start", async (ctx) => {
    const name = nameOf(ctx);
    await ctx.reply(`שלום ${name}, שמעון מחובר. שלח /help כדי לראות מה אתה מסוגל בכלל.`);
  });

  // Help
  bot.command("help", async (ctx) => {
    await ctx.reply(`📋 שמעון יודע לעשות את הדברים הבאים:
    
/start – התחלה וברוך הבא  
/prophecy – קבל תחזית פסימית מהבוט  
/laugh – שמעון יורד עליך  
/compliment – מחמאה גסה במיוחד  
/nextmvp – ניחוש מגוחך של שמעון  
/why – למה אני כזה גרוע?  
/shimon – משפט השראה מרושע  
/excuse – תירוץ מביך להפסד שלך  
/rage – התפרצות זעם של גיימר מתוסכל  
/daily – משפט יומי אכזרי משמעון`);
  });

  // כל שאר הפקודות
  bot.command("prophecy", ctx => ctx.reply(`🔮 ${nameOf(ctx)}, ${getRandom(prophecies)}`));
  bot.command("laugh", ctx => ctx.reply(`🤣 ${nameOf(ctx)}, ${getRandom(laughs)}`));
  bot.command("compliment", ctx => ctx.reply(`🎁 ${getRandom(compliments)}`));
  bot.command("nextmvp", ctx => ctx.reply(`🏆 ${getRandom(mvpPredictions)}`));
  bot.command("why", ctx => ctx.reply(`😓 ${nameOf(ctx)}, ${getRandom(insults)}`));
  bot.command("shimon", ctx => ctx.reply(`🎤 ${getRandom(shimonQuotes)}`));
  bot.command("excuse", ctx => ctx.reply(`🙄 ${getRandom(excuses)}`));
  bot.command("rage", ctx => ctx.reply(`😡 ${getRandom(rages)}`));
  bot.command("daily", ctx => ctx.reply(`📆 ${getRandom(dailyLines)}`));
};

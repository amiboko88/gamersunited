// 📁 telegramBridge.js – גשר בין הבוט לפעולות טריגרים, קללות ופקודות

const { handleTrigger, checkDailySilence } = require('./telegramTriggers');
const handleCurses = require('./telegramCurses');
const registerTelegramCommands = require('./telegramCommands');

// תזמון יומי לבדוק אם יש שקט מוגזם בקבוצה
function startDailyCheck(bot, chatId) {
  setInterval(() => {
    checkDailySilence(bot, chatId);
  }, 1000 * 60 * 60); // כל שעה
}

// רישום כל האינטראקציות
function setupTelegramBridge(bot, chatId) {
  // שליחת פקודות / קומנדס
  registerTelegramCommands(bot);

  // תגובות לטקסט, לינקים, סטיקרים, מילות מפתח וכו'
  bot.on('message', async (ctx) => {
    try {
      const triggered = handleTrigger(ctx);
      if (!triggered) {
        await handleCurses(ctx); // אם לא הופעל טריגר – בדוק קללות
      }
    } catch (err) {
      console.error('שגיאה בטיפול בהודעת טלגרם:', err);
    }
  });

  // בדיקה יומית אם הקבוצה מתה
  startDailyCheck(bot, chatId);
}

module.exports = {
  setupTelegramBridge
};

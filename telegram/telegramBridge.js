// 📁 handlers/telegramBridge.js
const { handleTrigger } = require('./telegramTriggers');
const handleCurses = require('./telegramCurses');
const registerTelegramCommands = require('./telegramCommands');

/**
 * מגדיר את כל מאזיני האירועים בזמן אמת עבור הבוט בטלגרם.
 * @param {import('grammy').Bot} bot - אובייקט הבוט של grammy.
 */
function setupTelegramBridge(bot) {
  // רישום פקודות (לדוגמה /start)
  registerTelegramCommands(bot);

  // האזנה להודעות נכנסות בזמן אמת
  bot.on('message', async (ctx) => {
    try {
      // בדיקת טריגרים (קישורים, מילות מפתח וכו')
      const triggered = await handleTrigger(ctx);
      // אם לא הופעל טריגר – בדוק אם יש קללות
      if (!triggered) {
        await handleCurses(ctx);
      }
    } catch (err) {
      console.error('שגיאה בטיפול בהודעת טלגרם:', err);
    }
  });

  // 💡 המשימה לבדיקת שקט בקבוצה הועברה למתזמן המרכזי (botLifecycle.js)
}

module.exports = {
  setupTelegramBridge
};
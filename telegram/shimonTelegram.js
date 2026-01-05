// 📁 telegram/shimonTelegram.js
const { Bot } = require("grammy");
const { analyzeTextForRoast, registerRoastButtons } = require("./roastTelegram");
const registerCommands = require("./telegramCommands");
const { registerBirthdayHandler } = require("./telegramBirthday");
const { handleTop, registerTopButton, updateXp } = require("./telegramLevelSystem");
const handleSmartReply = require("./shimonSmart");
const { isSpam } = require("./antiSpam");
const { triggerWords } = require("./smartKeywords");
const { log } = require('../utils/logger'); 

// ניהול משתמשים שמחכים לקלט (כמו יום הולדת)
const WAITING_USERS = new Map();

// בדיקה קריטית לפני שמתחילים
if (!process.env.TELEGRAM_TOKEN) {
    log("❌ [TELEGRAM] שגיאה: חסר TELEGRAM_TOKEN בקובץ .env");
    process.exit(1);
}

// יצירת המופע של הבוט
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// --- 1. רישום פקודות ומערכות ---
// מעבירים את הבוט לכל הקבצים החיצוניים כדי שירשמו את הפקודות שלהם
registerCommands(bot, WAITING_USERS);       // פקודות ראשיות (start, roast)
registerBirthdayHandler(bot, WAITING_USERS); // טיפול בימי הולדת
handleTop(bot);                             // טבלת מובילים
registerTopButton(bot);                     // כפתורי טבלה
registerRoastButtons(bot);                  // כפתורי רוסט

// פקודת יום הולדת (טריגר ראשוני)
bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add_birthday");
  await ctx.reply("מתי יום ההולדת שלך? כתוב לי בתבנית: DD.MM.YYYY (למשל 14.05.1990)");
});

// פקודת סטטיסטיקה (Placeholder לעתיד)
bot.command("stats", async (ctx) => {
    await ctx.reply("בקרוב: סטטיסטיקה אישית מלאה! 📊");
});

// --- 2. המוח המרכזי: טיפול בכל הודעת טקסט ---
bot.on("message:text", async (ctx) => {
  try {
      const text = ctx.message.text;
      
      // א. הגנת ספאם (AI + חוקים)
      if (await isSpam(ctx)) return;

      // ב. בדיקה אם ביקשו "לרדת" על מישהו
      if (text.includes("תרד על") || text.includes("רוסט ל") || text.includes("roast")) {
          await analyzeTextForRoast(ctx);
          return;
      }

      // ג. תשובה חכמה של שמעון (AI Chat)
      await handleSmartReply(ctx);

      // ד. מערכת XP (נקודות ורמות)
      // אנחנו מסננים הודעות קצרות מדי, אימוג'ים בלבד, או פקודות של הבוט עצמו
      const isOnlyEmoji = /^\p{Emoji}+$/u.test(text.trim());
      const cleanedText = text.trim();
      const isTriggerText = triggerWords.some(w => cleanedText.toLowerCase().includes(w));

      // נותנים XP רק על הודעות משמעותיות (מעל 3 תווים, לא טריגרים)
      if (!isOnlyEmoji && cleanedText.length >= 3 && !isTriggerText) {
          await updateXp({ 
              id: ctx.from.id,
              first_name: ctx.from.first_name,
              username: ctx.from.username,
              text: cleanedText
          }, ctx);
      }

  } catch (err) {
      console.error(`❌ [Telegram Message Error]: ${err.message}`);
  }
});

// --- 3. טיפול בשגיאות כלליות של הבוט ---
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`❌ [Telegram Error] Update ID ${ctx.update_id}:`, err.error);
});

// --- 4. הגדרת Webhook (רק שליחת הבקשה לטלגרם) ---
// הערה: השרת שמקבל את ההודעות (Express) נמצא ב-index.js הראשי!
// הקוד כאן רק מודיע לטלגרם לאן לשלוח את המידע.
if (process.env.RAILWAY_STATIC_URL) {
  const hookPath = "/telegram"; 
  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${hookPath}`;
  
  // אנחנו לא מריצים כאן app.listen כי זה יתנגש עם הפורט של הבוט הראשי
  // אבל אנחנו חייבים להגדיר את ה-Webhook מול ה-API של טלגרם
  bot.api.setWebhook(fullUrl)
    .then(() => log(`🔗 Telegram Webhook set to: ${fullUrl}`))
    .catch(e => log(`❌ Failed to set Telegram Webhook: ${e.message}`));
}

// --- 5. ייצוא הבוט החוצה ---
// זה החלק הקריטי שגורם ל-index.js לעבוד!
module.exports = { bot };
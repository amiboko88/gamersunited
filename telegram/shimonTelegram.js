// 📁 telegram/shimonTelegram.js (תיקון הפעלת Roast ו-Smart Reply)
// require("dotenv").config(); // יש לוודא שורה זו נמחקה אם לא בשימוש.
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const { analyzeTextForRoast, registerRoastButtons } = require("./roastTelegram"); // ✅ ייבוא analyzeTextForRoast
const db = require("../utils/firebase");
const registerCommands = require("./telegramCommands");
const { registerBirthdayHandler, validateBirthday, saveBirthday } = require("./telegramBirthday");
const { updateXP, handleTop, registerTopButton } = require("./telegramLevelSystem");
const handleSmartReply = require("./shimonSmart"); // ✅ ייבוא handleSmartReply
const { isSpam } = require("./antiSpam");
const { triggerWords } = require("./smartKeywords"); // ✅ ייבוא triggerWords


const WAITING_USERS = new Map();
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// רישום כל ההאנדלרים והפקודות בזמן עליית הבוט
registerCommands(bot, WAITING_USERS);
registerBirthdayHandler(bot, WAITING_USERS);
handleTop(bot);
registerTopButton(bot);
registerRoastButtons(bot);

// פקודת /birthday פשוטה מ-shimonTelegram
bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add");
  await ctx.reply("שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
});

// ✅ המאזין הראשי להודעות נכנסות - מנהל את זרימת התגובה
bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text?.trim() || "";
  const isSticker = !!ctx.message.sticker;
  const isCommand = text.startsWith("/");
  const isOnlyEmoji = /^[\p{Emoji}\s]+$/u.test(text);

  // 1. בדיקת ספאם - אם ספאם, מטפל ויוצא
  if (await isSpam(ctx)) return;

  // 2. טיפול במשתמשים במצב "המתנה" (לדוגמה: מזינים יום הולדת)
  if (WAITING_USERS.has(userId)) {
    const mode = WAITING_USERS.get(userId);
    if (["ביטול", "בטל", "cancel"].includes(text.toLowerCase())) {
      WAITING_USERS.delete(userId);
      return ctx.reply("ביטלת עדכון. אפשר תמיד לנסות שוב דרך /birthday 🎂");
    }
    if (mode === "add") {
      const bday = validateBirthday(text);
      if (!bday) {
        return ctx.reply("זה לא תאריך תקין. שלח תאריך כמו 28.06.1993, או 'ביטול'.");
      }
      try {
        await saveBirthday(ctx.from, bday);
        await ctx.reply("נשמר! מחכה לחגוג איתך – צפה לצלייה קולית משמעון 🎉");
      } catch (err) {
        console.error("❌ שגיאה בשמירת יום הולדת:", err);
        await ctx.reply("משהו נדפק, נסה שוב מאוחר יותר 😵");
      } finally {
        WAITING_USERS.delete(userId);
      }
      return; // סיום - טופל במצב המתנה
    }
    return; // סיום - טופל במצב המתנה לא ידוע
  }

  // 3. דילוג על הודעות מסוימות שלא דורשות תגובה AI או XP
  if (isCommand || isSticker || !text || isOnlyEmoji) return;

  // 4. טיפול ב"צלייה" (Roast)
  // analyzeTextForRoast כבר שולחת את התגובה בעצמה, ומחזירה true אם שלחה
  const roasted = await analyzeTextForRoast(text, ctx); // ✅ הקריאה התקינה
  if (roasted) {
      // אם בוצע roast, אין צורך להמשיך ל-smart reply או XP באותה הודעה
      return; 
  }

  // 5. טיפול ב"תגובה חכמה" (Smart Reply)
  // handleSmartReply יחליט אם ואיך להגיב, והוא שולח את התגובה בעצמו.
  const smartReplied = await handleSmartReply(ctx); // ✅ הקריאה התקינה
  // אם הופעלה תגובה חכמה, אין צורך להמשיך ל-XP
  if (smartReplied) { 
      return; 
  }

  // 6. עדכון XP (רק אם לא הייתה תגובה אחרת וזה טקסט תקין)
  // לוגיקת ה-XP הועברה ל-DM המשתמש או לוגים, אז רק נעדכן את הנתונים ב-DB.
  const cleanedText = text.trim();
  const isTriggerText = triggerWords.some(w => cleanedText.toLowerCase().includes(w));

  // ✅ עדכון XP מתבצע רק אם זו הודעה "לגיטימית" ולא סתם טריגר קצר
  // הודעות XP יעלו לרמת ה-DM בלבד!
  if (!isOnlyEmoji && cleanedText.length >= 3 && !isTriggerText) {
      await updateXP({
          id: ctx.from.id,
          first_name: ctx.from.first_name,
          username: ctx.from.username,
          text: cleanedText
      }, ctx); // העברת ctx לצורך שליחת DM
  }
});

// ✅ הגדרת Webhook/Polling - נשאר כפי שהיה
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram"; // הנתיב ל-webhook
  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  }).catch(err => {
    console.error(`❌ שגיאה ברישום Webhook: ${err.message}`);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 מאזין לטלגרם בפורט ${port}`);
  });
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL. מריץ בוט במצב Polling (פיתוח).");
  // אם אין webhook URL, מריץ בוט במצב Polling (לצרכי פיתוח/בדיקה מקומית)
  bot.start().then(() => console.log('🚀 בוט טלגרם במצב Polling.'));
}
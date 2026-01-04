// 📁 telegram/telegramCommands.js
const { generateRoastText } = require("./generateRoastText");
const { generateRoastVoice } = require("./telegramTTSRoaster");
const { log } = require('../utils/logger');

/**
 * פונקציה זו אחראית על רישום הפקודות הראשיות והתפריט.
 * (הלוגיקה של יום הולדת ורמות נמצאת בקבצים הנפרדים שלהם, אבל כאן אנחנו מסבירים עליהם)
 */
module.exports = function registerTelegramCommands(bot, WAITING_USERS) {
  
  // 1. הגדרת התפריט הכחול בטלגרם (Menu Button)
  // אנחנו רושמים כאן את כל הפקודות, גם אלו שמטופלות בקבצים אחרים
  bot.api.setMyCommands([
      { command: "start", description: "🚀 פתיחת תפריט והסברים" },
      { command: "roast", description: "🔥 שמעון נכנס במישהו" },
      { command: "birthday", description: "🎂 מתי יום ההולדת שלך?" },
      { command: "top", description: "🏆 טבלת המובילים (XP)" },
      { command: "stats", description: "📊 בדיקת סטטוס אישי" }
  ]).catch(err => log(`❌ [TELEGRAM] Failed to set commands: ${err.message}`));

  // --- פקודת /start - המדריך למשתמש ---
  bot.command("start", async (ctx) => {
    const user = ctx.from.first_name;
    
    // הודעה מושקעת עם כל היכולות
    await ctx.reply(
      `אהלן <b>${user}</b>! אני שמעון. 🤖\n` +
      `הבוט שמאחד את הקהילה בין הדיסקורד לטלגרם.\n\n` +
      `<b>📢 מה אני יודע לעשות?</b>\n\n` +
      `🔥 <b>ירידות (Roast):</b>\n` +
      `כתוב <code>/roast</code> ואני אכנס בך או בחבר. אפשר גם בטקסט וגם בהקלטה קולית!\n\n` +
      `🎂 <b>ימי הולדת:</b>\n` +
      `כתוב <code>/birthday</code> כדי לעדכן תאריך. אני מבטיח לזכור ולברך אותך.\n\n` +
      `🏆 <b>מערכת רמות (XP):</b>\n` +
      `כל הודעה בטלגרם נספרת! ה-XP שלך משותף עם הדיסקורד.\n` +
      `בדוק את המצב עם <code>/top</code>.\n\n` +
      `🧠 <b>בינה מלאכותית:</b>\n` +
      `אני קורא את הצ'אט. נסה לשאול "שמעון, מה אתה חושב על..." או סתם תייג אותי.\n` +
      `אני מזהה גם מילים כמו "קלימרו" או "וורזון" ומגיב בהתאם.\n\n` +
      `יאללה, תתחילו לחפור. 👇`,
      { parse_mode: "HTML" }
    );
  });

  // --- פקודת /roast - התפריט ---
  bot.command("roast", async (ctx) => {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📝 טקסט בלבד", callback_data: "demo_roast" },
          { text: "🎤 הקלטה קולית (TTS)", callback_data: "demo_voice" }
        ]
      ]
    };
    await ctx.reply("באיזה מצב צבירה אתה רוצה את הירידה?", { reply_markup: keyboard });
  });

  // --- טיפול בכפתורים (Callbacks) ---
  
  // 1. ירידה בטקסט
  bot.callbackQuery("demo_roast", async (ctx) => {
    const name = ctx.from.first_name || "חבר";
    
    // מעדכן את הכפתור כדי שלא ילחצו שוב
    await ctx.answerCallbackQuery({ text: "מחדד את הלשון..." });
    
    const roast = await generateRoastText(name);
    // ניקוי רווחים ותווים מיותרים
    const cleanRoast = roast.replace(/^["“”'`׳"״\s]+|["“”'`׳"״\s]+$/g, "").trim();
    
    await ctx.reply(`🧠 <b>ירידה על ${name}:</b>\n\n${cleanRoast}`, { parse_mode: "HTML" });
  });

  // 2. ירידה בקול (TTS)
  const runningVoiceUsers = new Set(); // מניעת ספאם לחיצות
  
  bot.callbackQuery("demo_voice", async (ctx) => {
    const userId = ctx.from.id;
    
    if (runningVoiceUsers.has(userId)) {
      return ctx.answerCallbackQuery({ text: "⏳ כבר מכין הקלטה, חכה רגע!", show_alert: false });
    }
    
    runningVoiceUsers.add(userId);
    await ctx.answerCallbackQuery({ text: "🎤 שמעון מקליט... זה ייקח רגע." });

    // שליחת חיווי "מקליט קול" למשתמש
    await ctx.replyWithChatAction('record_voice');

    try {
        const name = ctx.from.first_name || "חבר";
        const roastText = await generateRoastText(name);
        
        // קריאה לפונקציה החיצונית שמטפלת ביצירת הקובץ ובשליחתו
        await generateRoastVoice(ctx, roastText, name);
        
    } catch (error) {
        console.error("Voice Roast Error:", error);
        await ctx.reply("❌ הייתה בעיה עם הקול שלי, נגמרו לי המילים (או הטוקנים).");
    } finally {
        runningVoiceUsers.delete(userId);
    }
  });
};
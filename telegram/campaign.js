const { getBot } = require('./client');
const { log } = require('../utils/logger');
const brain = require('../handlers/ai/brain');

const TARGET_CHANNEL_ID = '-1002220458635'; // ID של קבוצת הטלגרם
// הערה: ניתן להוציא ל-.env אם יש מספר קבוצות, כרגע זה מקודד קשיח לפי הלוגים

async function runWeeklySpark() {
    const bot = getBot();
    if (!bot) return;

    log('✨ [Telegram Campaign] מתחיל את ה-Weekly Spark...');

    try {
        // 1. יצירת תוכן בעזרת AI
        const prompt = "כתוב הודעה קצרה, שנונה ומצחיקה לקבוצת גיימרים בטלגרם. המטרה: לגרום להם להגיב כדי שנדע שהם חיים. תשאל שאלה כמו 'מה המשחק ששרף לכם את השבוע?' או משהו בסגנון. תהיה קליל, שמעון הבוט.";

        // נשתמש במוח כדי לייצר את ההודעה (נשלח כאילו ליוזר מערכת 0)
        let messageText = await brain.ask('system', 'telegram', prompt);

        // אם ה-AI נכשל, הודעת ברירת מחדל
        if (!messageText) {
            messageText = "👋 תגידו, יש פה מישהו חי?\nתגיבו רגע שאני אדע את מי לסנכרן לדיסקורד! 👇";
        }

        // 2. הוספת הנעה לפעולה (Call to Action)
        const fullMessage = `${messageText}\n\n📢 **חברים, אנחנו עושים סדר בדרגות!**\nמי שרוצה שהדרגה שלו תעודכן - לחצו על הכפתור למטה או כתבו **/sync** בפרטי.`;

        // 3. שליחה עם כפתור
        const { InlineKeyboard } = require("grammy");
        const keyboard = new InlineKeyboard().url("🔗 סנכרן אותי עכשיו", "https://t.me/GamersUnited_Bot?start=sync");

        const msg = await bot.api.sendMessage(TARGET_CHANNEL_ID, fullMessage, {
            reply_markup: keyboard,
            parse_mode: "Markdown"
        });

        // 4. נעיצה (Pin) להקפצת התראה
        await bot.api.pinChatMessage(TARGET_CHANNEL_ID, msg.message_id);
        log('✅ [Telegram Campaign] הודעה נשלחה וננעצה בהצלחה.');

    } catch (e) {
        console.error('❌ [Telegram Campaign Error]', e);
    }
}

module.exports = { runWeeklySpark };

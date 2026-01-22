const { getBot } = require('./client');
const { log } = require('../utils/logger');
const brain = require('../handlers/ai/brain');

const TARGET_CHANNEL_ID_DEFAULT = '-1002220458635'; // Fallback

async function runWeeklySpark() {
    const bot = getBot();
    if (!bot) return;

    // 🧠 Fetch Real Group ID from DB (Auto-Learned)
    const db = require('../utils/firebase');
    let targetChatId = TARGET_CHANNEL_ID_DEFAULT;

    try {
        const doc = await db.collection('system_metadata').doc('config').get();
        if (doc.exists && doc.data().telegram_main_group) {
            targetChatId = doc.data().telegram_main_group;
        }
    } catch (e) { }

    log(`✨ [Telegram Campaign] מתחיל את ה-Weekly Spark (Target: ${targetChatId})...`);

    try {
        // 1. יצירת תוכן בעזרת AI
        const prompt = "כתוב הודעה קצרה, שנונה ומצחיקה לקבוצת גיימרים בטלגרם. המטרה: לגרום להם להגיב כדי שנדע שהם חיים. תשאל שאלה כמו 'מה המשחק ששרף לכם את השבוע?' או משהו בסגנון. תהיה קליל, שמעון הבוט.";

        // נשתמש במוח כדי לייצר את ההודעה (נשלח כאילו ליוזר מערכת - מספר דמה תקין שעובר ולידציה)
        // '100000000000000000' is 18 chars, solving the "cleanWhatsAppId" becoming empty string issue.
        let messageText = await brain.ask('100000000000000000', 'telegram', prompt, true, null, null, true); // true = skipPersistence

        // אם ה-AI נכשל, הודעת ברירת מחדל
        if (!messageText) {
            messageText = "👋 תגידו, יש פה מישהו חי?\nתגיבו רגע שאני אדע את מי לסנכרן לדיסקורד! 👇";
        }

        // 2. הוספת הנעה לפעולה (Call to Action)
        const fullMessage = `${messageText}\n\n📢 **חברים, אנחנו עושים סדר בדרגות!**\nמי שרוצה שהדרגה שלו תעודכן - לחצו על הכפתור למטה או כתבו **/sync** בפרטי.`;

        // 3. שליחה עם כפתור
        const { InlineKeyboard } = require("grammy");
        const keyboard = new InlineKeyboard().url("🔗 סנכרן אותי עכשיו", "https://t.me/GamersUnited_Bot?start=sync");

        const msg = await bot.api.sendMessage(targetChatId, fullMessage, {
            reply_markup: keyboard,
            parse_mode: "Markdown"
        });

        // 4. נעיצה (Pin) להקפצת התראה
        await bot.api.pinChatMessage(targetChatId, msg.message_id).catch(e => log(`⚠️ [Telegram] Pin failed (Admin rights?): ${e.message}`));
        log('✅ [Telegram Campaign] הודעה נשלחה וננעצה בהצלחה.');

    } catch (e) {
        if (e.description?.includes('chat not found')) {
            log(`❌ [Telegram Error] הבוט לא מוצא את הקבוצה ${targetChatId}. וודא שהבוט חבר בקבוצה ויש לו הרשאות!`);
        } else {
            console.error('❌ [Telegram Campaign Error]', e);
        }
    }
}

module.exports = { runWeeklySpark };

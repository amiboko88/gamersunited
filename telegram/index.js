const { getBot } = require('./client');
const { log } = require('../utils/logger');

// ייבוא המטפלים המודולריים
const registerCommands = require('./handlers/commands');
const registerMessages = require('./handlers/messages');

async function launchTelegram() {
    const bot = getBot();
    if (!bot) {
        log("❌ [TELEGRAM] לא הוגדר טוקן ב-.env");
        return;
    }

    try {
        // רישום פקודות והודעות
        registerCommands(bot);
        registerMessages(bot);

        // טיפול בשגיאות גלובלי
        bot.catch((err) => console.error(`⚠️ Telegram Error: ${err.message}`));

        // הגדרת תפריט הפקודות (UI)
        await bot.api.setMyCommands([
            { command: "me", description: "הצג את הפרופיל והדרגה שלי 📊" },
            { command: "top", description: "טבלת האלופים השבועית 🏆" },
            { command: "ping", description: "בדיקת דופק 🏓" }
        ]);



        // הפעלה
        await bot.start({
            allowed_updates: ["message"],
            drop_pending_updates: true,
            onStart: (info) => log(`✅ [TELEGRAM] מחובר כ-@${info.username}`)
        });
    } catch (e) {
        log(`❌ [TELEGRAM] נכשל בהפעלה: ${e.message}`);
    }
}

async function stopTelegram() {
    const bot = getBot();
    if (bot) {
        log("🛑 [TELEGRAM] עוצר...");
        await bot.stop();
    }
}

module.exports = { launchTelegram, stopTelegram };
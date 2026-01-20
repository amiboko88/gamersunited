const { Bot } = require("grammy"); // ✅ Import Bot class
const { setBot, getBot } = require('./client'); // ✅ Import setBot
const { log } = require('../utils/logger');

// ייבוא המטפלים המודולריים (Make sure these exist and are correct)
const registerCommands = require('./handlers/commands');
const registerMessages = require('./handlers/messages');

async function launchTelegram() {
    // 1. Check if already running to avoid duplicates
    if (getBot()) return;

    // 2. Validate Token
    if (!process.env.TELEGRAM_TOKEN) {
        log("❌ [TELEGRAM] חסר טוקן (TELEGRAM_TOKEN).");
        return;
    }

    try {
        // 3. Create Instance
        const bot = new Bot(process.env.TELEGRAM_TOKEN);

        // 4. Register Globally (Crucial Fix)
        setBot(bot);

        // 5. Register Handlers
        if (registerCommands) registerCommands(bot);
        if (registerMessages) registerMessages(bot);

        // 6. Global Error Handler
        bot.catch((err) => console.error(`⚠️ Telegram Error: ${err.message}`));

        // 7. Set UI Commands
        await bot.api.setMyCommands([
            { command: "me", description: "הצג את הפרופיל והדרגה שלי 📊" },
            { command: "top", description: "טבלת האלופים השבועית 🏆" },
            { command: "ping", description: "בדיקת דופק 🏓" }
        ]);

        // 8. Start Bot
        bot.start({
            allowed_updates: ["message"],
            drop_pending_updates: true,
            onStart: (info) => log(`✅ [TELEGRAM] מחובר כ-@${info.username}`)
        }).catch(e => log(`❌ [TELEGRAM] שגיאה בריצה: ${e.message}`));

    } catch (e) {
        log(`❌ [TELEGRAM] נכשל בהפעלה: ${e.message}`);
        setBot(null); // Cleanup on failure
    }
}

async function stopTelegram() {
    const bot = getBot();
    if (bot) {
        log("🛑 [TELEGRAM] עוצר...");
        await bot.stop();
        setBot(null); // ✅ Cleanup global instance
    }
}

module.exports = { launchTelegram, stopTelegram };
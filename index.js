// 📁 index.js (Root)
require('dotenv').config();
const express = require('express'); 

// ✅ ייבוא המערכות - שימוש ב-getWhatsAppSock החדש
const { connectToWhatsApp, disconnectWhatsApp, getWhatsAppSock } = require('./whatsapp/index'); 
const { launchTelegram, stopTelegram, bot: telegramBot } = require('./telegram/index'); // וודא שאתה מייצא את bot מטלגרם
const { launchDiscord, stopDiscord, client: discordClient } = require('./discord/index'); // וודא שאתה מייצא את client מדיסקורד
const rankingManager = require('./handlers/ranking/manager'); // ✅ ייבוא מנהל הדירוג

// --- 🛡️ טיפול בשגיאות ---
process.on('unhandledRejection', (reason, promise) => {
    if (reason?.toString().includes('Conflict') || reason?.toString().includes('409') || reason?.toString().includes('440')) return;
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.get('/', (req, res) => res.status(200).send('🤖 Shimon AI 2026 is Online.'));

const server = app.listen(PORT, () => {
    console.log(`🌍 Server listening on port ${PORT}`);
});

// --- 🛑 מנגנון כיבוי ---
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 [System] Received ${signal}. Shutting down...`);
    server.close(); 
    await Promise.all([
        disconnectWhatsApp().catch(e => console.error('WA Error:', e.message)),
        stopTelegram().catch(e => console.error('TG Error:', e.message)),
        stopDiscord().catch(e => console.error('DS Error:', e.message))
    ]);
    console.log('👋 [System] Goodbye.');
    process.exit(0);
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

// --- 🚀 הפעלת הבוט ---
(async () => {
    try {
        console.log('⏳ [System] Waiting 5 seconds for cleanup...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('🚀 [System] Starting Shimon AI 2026...');

        // 1. הפעלת פלטפורמות
        await connectToWhatsApp().catch(e => console.error('❌ WhatsApp Init Failed:', e.message));
        await launchTelegram().catch(e => console.error('❌ Telegram Init Failed:', e.message));
        await launchDiscord().catch(e => console.error('❌ Discord Init Failed:', e.message));

        // 2. ✅ הפעלת מנהל הדירוג (החלק שהיה חסר!)
        // אנחנו מעבירים לו את הקליינטים שהופעלו הרגע
        if (rankingManager) {
            console.log('🏆 [System] Initializing Ranking Manager...');
            rankingManager.init(
                discordClient, 
                getWhatsAppSock(), // שליפת הסוקט החי
                process.env.WHATSAPP_MAIN_GROUP_ID,
                telegramBot
            );
        }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
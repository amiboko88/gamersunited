// 📁 index.js (Root)
require('dotenv').config();
const express = require('express'); 

// ✅ ייבוא המערכות - חייב לוודא שהקבצים בתיקיות מייצאים את הפונקציות האלו!
const { connectToWhatsApp, disconnectWhatsApp } = require('./whatsapp/index'); 
const { launchTelegram, stopTelegram } = require('./telegram/index');
const { launchDiscord, stopDiscord } = require('./discord/index');

// --- 🛡️ טיפול בשגיאות גלובלי ---
process.on('unhandledRejection', (reason, promise) => {
    if (reason?.toString().includes('Conflict') || reason?.toString().includes('409') || reason?.toString().includes('440')) return;
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup (חובה בשביל Railway) ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.get('/', (req, res) => res.status(200).send('🤖 Shimon AI 2026 is Online.'));

const server = app.listen(PORT, () => {
    console.log(`🌍 Server listening on port ${PORT}`);
});

// --- 🛑 מנגנון כיבוי מסודר (Graceful Shutdown) ---
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n🛑 [System] Received ${signal}. Shutting down...`);
    
    server.close(); // סוגר את הפורט HTTP

    // מכבה את הבוטים כדי לשחרר את הטוקנים והסוקטים
    await Promise.all([
        disconnectWhatsApp().catch(e => console.error('WA Disconnect Error:', e.message)),
        stopTelegram().catch(e => console.error('TG Stop Error:', e.message)),
        stopDiscord().catch(e => console.error('DS Stop Error:', e.message))
    ]);
    
    console.log('👋 [System] Goodbye.');
    process.exit(0);
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

// --- 🚀 הפעלת הבוט ---
(async () => {
    try {
        // המתנה לניקוי התהליך הקודם ב-Railway
        console.log('⏳ [System] Waiting 5 seconds for previous instance to cleanup...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('🚀 [System] Starting Shimon AI 2026...');

        // 1. הפעלת וואטסאפ
        try {
            await connectToWhatsApp();
        } catch (err) { console.error('❌ WhatsApp Init Failed:', err.message); }

        // 2. הפעלת טלגרם
        try {
            await launchTelegram();
        } catch (e) { console.error('❌ Telegram Init Failed:', e.message); }

        // 3. הפעלת דיסקורד
        try {
            await launchDiscord();
        } catch (e) { console.error('❌ Discord Init Failed:', e.message); }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
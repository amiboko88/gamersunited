// 📁 index.js (Root)
require('dotenv').config();
const express = require('express'); 

// ✅ ייבוא המערכות בצורה בטוחה
const { connectToWhatsApp } = require('./whatsapp/index'); 
const { launchTelegram } = require('./telegram/index');
const { launchDiscord } = require('./discord/index'); // ✅ ייבוא הפונקציה החדשה

// --- 🛡️ טיפול בשגיאות קריטיות (Anti-Crash) ---
process.on('unhandledRejection', (reason, promise) => {
    // התעלמות משגיאות Telegram Conflict זמניות בזמן ריסט
    if (reason?.toString().includes('409') && reason?.toString().includes('Conflict')) return;
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup (Railway / Health Check) ---
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('🤖 Shimon AI 2026 is Online & Healthy.');
});

app.listen(PORT, () => {
    console.log(`🌍 Server listening on port ${PORT}`);
});

// --- 🚀 הפעלת הבוט (Main Entry Point) ---
(async () => {
    try {
        console.log('🚀 [System] Starting Shimon AI 2026...');

        // 1. הפעלת וואטסאפ
        try {
            console.log('🔄 [Init] Launching WhatsApp...');
            await connectToWhatsApp();
        } catch (err) {
            console.error('❌ WhatsApp Init Failed:', err.message);
        }

        // 2. הפעלת טלגרם
        try {
            console.log('🔄 [Init] Launching Telegram...');
            await launchTelegram();
        } catch (e) {
            console.error('❌ Telegram Init Failed:', e.message);
        }

        // 3. הפעלת דיסקורד (עכשיו בצורה מבוקרת!)
        try {
            console.log('🔄 [Init] Launching Discord...');
            await launchDiscord(); // ✅ קריאה לפונקציה במקום require
        } catch (e) {
            console.error('❌ Discord Init Failed:', e.message);
        }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
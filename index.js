// 📁 index.js (Root)
require('dotenv').config();
const express = require('express'); 

// ✅ ייבוא המערכות (שימוש בפונקציות השקה היכן שצריך)
const { connectToWhatsApp } = require('./whatsapp/index'); 
const { launchTelegram } = require('./telegram/index'); // ✅ התיקון: מייבאים את הפונקציה

// --- 🛡️ טיפול בשגיאות קריטיות (Anti-Crash) ---
// זה מונע מהבוט לקרוס לחלוטין אם יש שגיאה לא מטופלת באחת המערכות
process.on('unhandledRejection', (reason, promise) => {
    // מסנן שגיאות ידועות של וואטסאפ שלא דורשות פאניקה
    if (reason?.toString().includes('rate-overlimit')) return;
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup (Railway / Health Check) ---
// זה מה ששומר את הבוט "חי" בשרתים כמו Railway
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

        // 2. הפעלת טלגרם (התיקון הגדול)
        // עכשיו אנחנו קוראים לפונקציה במקום סתם לעשות require
        try {
            console.log('🔄 [Init] Launching Telegram...');
            await launchTelegram();
        } catch (e) {
            console.error('❌ Telegram Init Failed:', e.message);
        }

        // 3. הפעלת דיסקורד
        // בדיסקורד המבנה הוא שונה (ה-require עצמו מפעיל את הלקוח בתוך הקובץ)
        try {
            console.log('🔄 [Init] Launching Discord...');
            require('./discord/index');
        } catch (e) {
            console.error('❌ Discord Init Failed:', e.message);
        }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
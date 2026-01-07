// 📁 index.js (Root)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express'); 

// ✅ טעינת המערכות החדשות (לפי המבנה החדש שיצרנו)
const { connectToWhatsApp } = require('./whatsapp/index'); 

// --- 🛡️ טיפול בשגיאות קריטיות (Anti-Crash) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup (Railway / Health Check) ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());

app.get('/', (req, res) => res.send('🤖 Shimon AI 2026 is Online.'));

// הפעלת השרת
app.listen(PORT, () => {
    console.log(`🌍 Server listening on port ${PORT}`);
});

// --- 🚀 הפעלת הבוט (Main Entry Point) ---
(async () => {
    try {
        console.log('🚀 [System] Starting Shimon AI 2026...');

        // 1. הפעלת וואטסאפ
        // הוא עצמאי ומנהל את החיבור שלו
        connectToWhatsApp().catch(err => console.error('❌ WhatsApp Init Failed:', err));

        // 2. הפעלת טלגרם
        // טוען את האינדקס החדש שמפעיל את הבוט לבד
        try {
            require('./telegram/index');
        } catch (e) {
            console.error('❌ Telegram Init Failed:', e);
        }

        // 3. הפעלת דיסקורד
        // טוען את האינדקס החדש שמנהל את הלקוח והאירועים
        try {
            require('./discord/index');
        } catch (e) {
            console.error('❌ Discord Init Failed:', e);
        }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
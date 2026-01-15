// 📁 index.js (Root)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fortuneWheel = require('./handlers/economy/fortuneWheel');

const { connectToWhatsApp, disconnectWhatsApp, getWhatsAppSock } = require('./whatsapp/index');
const { getBot } = require('./telegram/client'); // ✅ יבוא ישיר של הגטר
const { launchTelegram, stopTelegram } = require('./telegram/index');
const { launchDiscord, stopDiscord, client: discordClient } = require('./discord/index');
const rankingManager = require('./handlers/ranking/manager');
const scheduler = require('./handlers/scheduler'); // ✅ ייבוא הסקג'ולר

process.on('unhandledRejection', (reason) => {
    if (reason?.toString().includes('Conflict') || reason?.toString().includes('409') || reason?.toString().includes('440')) return;
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
// ✅ הגשה מאובטחת של הקובץ הספציפי
app.get('/telegram/wheel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'telegram/wheel.html'));
});

// --- API Endpoints ---
app.post('/api/wheel/spin', async (req, res) => {
    try {
        const { userId, platform } = req.body;
        const result = await fortuneWheel.processSpin(userId, platform);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.status(200).send('🤖 Shimon AI 2026 is Online.'));

const server = app.listen(PORT, () => {
    console.log(`🌍 Server listening on port ${PORT}`);
});

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

(async () => {
    try {
        console.log('⏳ [System] Waiting 10 seconds for deep cleanup of previous instances...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('🚀 [System] Starting Shimon AI 2026...');

        // הפעלה מדורגת
        await connectToWhatsApp().catch(e => console.error('❌ WhatsApp Init Failed:', e.message));
        await new Promise(r => setTimeout(r, 2000));

        await launchTelegram().catch(e => console.error('❌ Telegram Init Failed:', e.message));
        await new Promise(r => setTimeout(r, 2000));

        await launchDiscord().catch(e => console.error('❌ Discord Init Failed:', e.message));

        // הפעלת משימות מתוזמנות (Cron)
        if (discordClient && scheduler) {
            scheduler.initScheduler(discordClient);
        }

        if (rankingManager) {
            console.log('🏆 [System] Initializing Ranking Manager...');
            rankingManager.init(
                discordClient,
                getWhatsAppSock(),
                process.env.WHATSAPP_MAIN_GROUP_ID,
                getBot() // ✅ שליפת האינסטנס החי
            );
        }

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
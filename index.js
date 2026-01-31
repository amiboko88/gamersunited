// 📁 index.js (Root)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fortuneWheel = require('./handlers/economy/fortuneWheel');

const { connectToWhatsApp, disconnectWhatsApp, getWhatsAppSock } = require('./whatsapp/index');
const { getBot } = require('./telegram/client');
const { launchTelegram, stopTelegram } = require('./telegram/index');
const { launchDiscord, stopDiscord, client: discordClient } = require('./discord/index');
const rankingManager = require('./handlers/ranking/manager');
const scheduler = require('./handlers/scheduler');
const birthdayManager = require('./handlers/birthday/manager');
const fifoCleaner = require('./handlers/fifo/cleaner');
const statusSystem = require('./handlers/system/statusRotator');
const intelManager = require('./handlers/intel/manager');

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

    // 💾 Panic Save: Save WhatsApp History before death
    const whatsappStore = require('./whatsapp/store');
    console.log('💾 [System] Saving WhatsApp Store to Cloud...');

    await Promise.all([
        whatsappStore.saveToFirestore().catch(e => console.error('Store Save Error:', e.message)),
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
                getBot()
            );
        }

        if (birthdayManager) birthdayManager.init(discordClient, getWhatsAppSock(), process.env.WHATSAPP_MAIN_GROUP_ID, getBot());
        if (fifoCleaner) fifoCleaner.startAutoClean(discordClient);
        if (statusSystem) statusSystem.start(discordClient);
        if (intelManager) intelManager.initIntel(discordClient, getWhatsAppSock(), getBot());

        // 🕯️ Shabbat Manager Init
        const shabbatManager = require('./handlers/community/shabbat');
        if (shabbatManager) shabbatManager.init(discordClient, getWhatsAppSock(), getBot());

        // ✅ Ghost Protocol Init (CRITICAL Fix)
        const ghostProtocol = require('./handlers/users/ghostProtocol');
        if (ghostProtocol) {
            console.log('👻 [System] Initializing Ghost Protocol...');
            ghostProtocol.init(discordClient, getWhatsAppSock());
        }

        // 🛠️ Admin Command: Ghost Protocol Test
        discordClient.on('messageCreate', async (message) => {
            if (message.content.startsWith('!testbounty') && message.author.id === '524302700695912506') {
                const args = message.content.split(' ');
                let targetId = args[1]; // יכול להיות ריק

                try {
                    const ghostProtocol = require('./handlers/users/ghostProtocol');
                    let targetUser = null;

                    // מצב 1: חיפוש אוטומטי של רוח רפאים (ללא ארגומנטים)
                    if (!targetId) {
                        message.reply("🔍 Searching DB for a Ghost (Phone ✅, WA ❌)...");
                        const ghostData = await ghostProtocol.findNextGhost();

                        if (!ghostData) {
                            return message.reply("✅ כולם כשרים! לא נמצאו משתמשים עם מספר וללא LID.");
                        }

                        targetId = ghostData.id; // ה-ID של דיסקורד מהמסד
                        await message.channel.send(`🎯 **מטרה נמצאה:** ${ghostData.username || 'Unknown'} (ID: ${targetId})`);
                    }

                    // מצב 2: יש לנו ID (בין אם ידני ובין אם מהחיפוש)
                    targetUser = await discordClient.users.fetch(targetId).catch(() => null);

                    if (!targetUser) {
                        return message.reply(`❌ User ID ${targetId} not found in Discord Cache.`);
                    }

                    const result = await ghostProtocol.declareGhost(targetUser.id, targetUser.username, targetUser.displayAvatarURL({ extension: 'png' }));

                    if (result) {
                        // שליחה לערוץ שבו בוצעה הפקודה (בתור סימולציה לקבוצה)
                        await message.channel.send({ content: result.text, files: [result.posterBuffer] });

                        // כאן בעקרון זה נשלח לקבוצת הוואטסאפ במערכת האמיתית
                        // אנחנו לא שולחים DM כי המטרה היא שייראו אותו בקבוצה
                    } else {
                        message.reply("⚠️ המשתמש הזה כבר מבוקש (Bounty Active).");
                    }

                } catch (e) {
                    message.reply(`❌ Error: ${e.message}`);
                    console.error(e);
                }
            }
        });

    } catch (error) {
        console.error('🔥 [System] Fatal Start Error:', error);
    }
})();
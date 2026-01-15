// 📁 index.js (Root)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fortuneWheel = require('./handlers/economy/fortuneWheel'); // נצור את זה עוד רגע

const { connectToWhatsApp, disconnectWhatsApp, getWhatsAppSock } = require('./whatsapp/index');
const { getBot } = require('./telegram/client'); // ✅ יבוא ישיר של הגטר

// Assuming 'app' is initialized somewhere here, e.g., const app = express();
// For the purpose of this edit, I'll place the new code after the initial requires.
const app = express(); // Added for context, assuming it exists

app.use(express.json());
// ✅ הגשה מאובטחת של הקובץ הספציפי (כדי לא לחשוף את כל הקוד בתיקיית telegram)
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

// ...

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
}) ();
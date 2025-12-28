require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { connectToWhatsApp, sendToMainGroup } = require('./whatsapp/index'); // וודא שזה מיובא
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const cron = require('node-cron');
const { log } = require('./utils/logger');
const express = require('express');

// --- הגדרות הניטור (מהבקשה שלך) ---
const FIFO_VOICE_CHANNEL_ID = '1231453923387379783';
const WARZONE_APP_ID = '1372319014398726225'; // ID של המשחק שסיפקת

const app = express();
const PORT = process.env.PORT || 8080;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences 
    ]
});

client.commands = new Collection();

// שרת HTTP בסיסי (בשביל Railway)
app.use(express.json());
app.post('/telegram', (req, res) => res.sendStatus(200));
app.listen(PORT, () => log(`🚀 מאזין בפורט ${PORT}`));

// --- הפעלת שמעון וחיבור לוואטסאפ ---
(async () => {
    await loadCommands(client);
    await loadEvents(client);
    await client.login(process.env.DISCORD_TOKEN);
    
    // חיבור וואטסאפ
    connectToWhatsApp(client);
})();

// --- המוניטור של WARZONE ---
let isGameSessionActive = false;

function startWarzoneMonitor() {
    log('[Warzone Monitor] 👀 העין הגדולה נפתחה - מאזין לערוץ FIFO...');
    
    // בדיקה כל דקה (60000ms)
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.first(); 
            if (!guild) return;

            const channel = guild.channels.cache.get(FIFO_VOICE_CHANNEL_ID);
            if (!channel || !channel.isVoiceBased()) {
                // log('[Monitor] Channel not found or not voice.'); // להוריד הערה לדיבאג
                return;
            }

            // 1. בדיקת כמות אנשים בחדר (לפחות 3)
            const members = channel.members;
            if (members.size < 3) {
                if (isGameSessionActive) {
                    log('[Monitor] סשן הסתיים (פחות מ-3 אנשים).');
                    isGameSessionActive = false; // איפוס סטטוס
                }
                return;
            }

            // 2. בדיקה מי משחק WARZONE לפי ה-ID
            let warzonePlayers = 0;
            members.forEach(member => {
                const activities = member.presence?.activities || [];
                const isPlaying = activities.some(act => 
                    act.applicationId === WARZONE_APP_ID || // לפי ה-ID שנתת
                    (act.name && act.name.toLowerCase().includes('call of duty')) // גיבוי לפי שם
                );
                
                if (isPlaying) warzonePlayers++;
            });

            log(`[Monitor Debug] בחדר: ${members.size} | משחקים: ${warzonePlayers}`);

            // 3. טריגר: לפחות 2 שחקנים פעילים מתוך הנוכחים, והסשן לא פעיל כרגע
            if (warzonePlayers >= 2 && !isGameSessionActive) {
                isGameSessionActive = true; // נועלים כדי לא לחפור
                
                const alertText = "🚨 **התראת מלחמה!**\nשמעון מזהה סשן WARZONE פעיל בחדר FIFO.\n\nחברים יקרים, נא לרשום דמג' (Damage) בסוף כל סיבוב.\nלדוגמה: *עמוס 2500*\nמי שלא רושם מקבל לאפה.";
                
                log('[Monitor] 🚨 זיהוי סשן! שולח לוואטסאפ...');
                await sendToMainGroup(alertText);
            }

        } catch (err) {
            console.error('[Monitor Error]', err);
        }
    }, 60000); 
}

// הפעלת המוניטור כשהבוט מוכן
client.once('ready', () => {
    log(`⚡️ Shimon is READY! Logged in as ${client.user.tag}`);
    startWarzoneMonitor();
});
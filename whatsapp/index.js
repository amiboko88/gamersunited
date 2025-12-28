require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { connectToWhatsApp, sendToMainGroup } = require('./whatsapp/index'); // ייבוא הפונקציות מוואטסאפ
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { log } = require('./utils/logger');
const express = require('express');

// --- הגדרות הניטור (לפי ה-IDs שנתת) ---
const FIFO_VOICE_CHANNEL_ID = '1231453923387379783'; // הערוץ שבו בודקים נוכחות
const WARZONE_APP_ID = '1372319014398726225'; // ה-ID של Call of Duty

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרת הלקוח של דיסקורד עם כל ההרשאות הנדרשות
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates, // חובה בשביל לראות מי בערוץ קול
        GatewayIntentBits.GuildPresences    // חובה בשביל לראות במה הם משחקים
    ]
});

client.commands = new Collection();

// --- שרת HTTP בסיסי (בשביל Railway) ---
// זה מונע מ-Railway לכבות את הבוט ומאפשר לראות שהוא "חי"
app.use(express.json());
app.get('/', (req, res) => res.send('Shimon Bot is Alive 🤖'));
app.post('/telegram', (req, res) => res.sendStatus(200)); // אם יש לך גם טלגרם
app.listen(PORT, () => log(`🚀 Server listening on port ${PORT}`));

// --- הפעלת שמעון ---
(async () => {
    // 1. טעינת פקודות ואירועים של דיסקורד
    await loadCommands(client);
    await loadEvents(client);
    
    // 2. התחברות לדיסקורד
    await client.login(process.env.DISCORD_TOKEN);
    
    // 3. התחברות לוואטסאפ
    connectToWhatsApp(client);
})();

// --- המוניטור של WARZONE ("העין הגדולה") ---
let isGameSessionActive = false;

function startWarzoneMonitor() {
    log('[Warzone Monitor] 👀 העין הגדולה נפתחה - מאזין לערוץ FIFO...');
    
    // בדיקה כל דקה (60000ms)
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.first(); // מניח שהבוט נמצא בשרת אחד עיקרי
            if (!guild) return;

            const channel = guild.channels.cache.get(FIFO_VOICE_CHANNEL_ID);
            
            // בדיקות תקינות לערוץ
            if (!channel) {
                // log(`[Monitor Warning] ערוץ ${FIFO_VOICE_CHANNEL_ID} לא נמצא.`);
                return;
            }
            if (!channel.isVoiceBased()) return;

            // 1. בדיקת כמות אנשים בחדר (לפחות 3 כדי להחשיב כסשן)
            const members = channel.members;
            if (members.size < 3) {
                if (isGameSessionActive) {
                    log('[Monitor] סשן הסתיים (פחות מ-3 אנשים).');
                    isGameSessionActive = false; // איפוס סטטוס כדי שנוכל להתריע שוב בעתיד
                }
                return;
            }

            // 2. בדיקה מי משחק WARZONE בפועל
            let warzonePlayers = 0;
            members.forEach(member => {
                const activities = member.presence?.activities || [];
                
                // בדיקה כפולה: או לפי ה-ID המדויק שנתת, או לפי השם (לגיבוי)
                const isPlaying = activities.some(act => 
                    act.applicationId === WARZONE_APP_ID || 
                    (act.name && act.name.toLowerCase().includes('call of duty')) ||
                    (act.name && act.name.toLowerCase().includes('warzone'))
                );
                
                if (isPlaying) warzonePlayers++;
            });

            // לוג דיבאג שקט (אופציונלי)
            // console.log(`[Monitor Debug] בחדר: ${members.size} | משחקים COD: ${warzonePlayers}`);

            // 3. ההחלטה: האם לשלוח התראה?
            // התנאי: לפחות 2 שחקנים פעילים מתוך הנוכחים בחדר, והסשן לא הוכרז עדיין
            if (warzonePlayers >= 2 && !isGameSessionActive) {
                isGameSessionActive = true; // נועלים את הסטטוס
                
                const alertText = "🚨 **התראת מלחמה!**\nשמעון מזהה סשן WARZONE פעיל בחדר FIFO.\n\nחברים יקרים, נא לרשום דמג' (Damage) בסוף כל סיבוב.\nלדוגמה: *עמוס 2500*\nמי שלא רושם מקבל לאפה.";
                
                log('[Monitor] 🚨 זיהוי סשן! שולח לוואטסאפ...');
                
                // שליחה לקבוצת הוואטסאפ הראשית
                await sendToMainGroup(alertText);
            }

        } catch (err) {
            console.error('[Monitor Error]', err);
        }
    }, 60000); // רץ כל 60 שניות
}

// הפעלת המוניטור רק כשהבוט מוכן ומחובר
client.once('ready', () => {
    log(`⚡️ Shimon is READY! Logged in as ${client.user.tag}`);
    startWarzoneMonitor();
});
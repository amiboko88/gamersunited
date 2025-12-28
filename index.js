// 📁 index.js
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes, MessageFlags } = require('discord.js');
const express = require('express'); // ✅ תוספת לשרת
const { connectToWhatsApp, sendToMainGroup } = require('./whatsapp/index'); // ✅ תוספת לוואטסאפ

// --- UTILS & TELEGRAM ---
const db = require('./utils/firebase');
require("./telegram/shimonTelegram");

// --- SERVER SETUP (RAILWAY HEALTH CHECK) --- 
// ✅ הוספנו את זה כדי ש-Railway לא יכבה את הבוט
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.post('/telegram', (req, res) => res.sendStatus(200));
app.get('/', (req, res) => res.send('Shimon Bot is Alive 🤖'));
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

// --- CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.db = db;
global.client = client;

// --- DYNAMIC HANDLER LOADING ---
client.commands = new Collection();
client.interactions = new Collection();
client.dynamicInteractionHandlers = [];
client.voiceConnections = new Collection();
client.audioPlayers = new Collection();

// Load Slash Commands (הקוד המקורי שלך שנשמר)
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command?.data?.name) {
            client.commands.set(command.data.name, command);
        }
    } catch(err) {
        console.warn(`⚠️ שגיאה בטעינת פקודה ${file}: ${err.message}`);
    }
}

// Improved Interaction Loader (הקוד המקורי שלך שנשמר)
const interactionsPath = path.join(__dirname, 'interactions');
if (fs.existsSync(interactionsPath)) {
    const loadHandlers = (dir) => {
        const filesAndFolders = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of filesAndFolders) {
            const itemPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                loadHandlers(itemPath);
            } else if (item.isFile() && item.name.endsWith('.js')) {
                try {
                    const handler = require(itemPath);
                    if (typeof handler.customId === 'string') {
                        client.interactions.set(handler.customId, handler);
                    } else if (typeof handler.customId === 'function') {
                        client.dynamicInteractionHandlers.push(handler);
                    }
                } catch(err) {
                    console.warn(`⚠️ שגיאה בטעינת אינטראקציה ${item.name}: ${err.message}`);
                }
            }
        }
    };
    loadHandlers(interactionsPath);
    console.log(`💡 נטענו ${client.interactions.size} אינטראקציות סטטיות ו-${client.dynamicInteractionHandlers.length} דינאמיות.`);
}

// --- SLASH COMMAND REGISTRATION ---
(async () => {
    const slashCommands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log(`📦 רושם ${slashCommands.length} Slash Commands...`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: slashCommands },
        );
        console.log(`✅ Slash Commands נרשמו בהצלחה לשרת!`);
    } catch (err) {
        console.error('❌ שגיאה ברישום Slash Commands:', err);
    }
})();

// --- ✅ הגדרות WARZONE MONITOR ---
const FIFO_VOICE_CHANNEL_ID = '1231453923387379783';
const WARZONE_APP_ID = '1372319014398726225';
let isGameSessionActive = false;

function startWarzoneMonitor() {
    console.log('[Warzone Monitor] 👀 העין הגדולה נפתחה - מאזין לערוץ FIFO...');
    
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return;

            const channel = guild.channels.cache.get(FIFO_VOICE_CHANNEL_ID);
            if (!channel || !channel.isVoiceBased()) return;

            const members = channel.members;
            if (members.size < 3) {
                if (isGameSessionActive) {
                    console.log('[Monitor] סשן הסתיים.');
                    isGameSessionActive = false;
                }
                return;
            }

            let warzonePlayers = 0;
            members.forEach(member => {
                const activities = member.presence?.activities || [];
                const isPlaying = activities.some(act => 
                    act.applicationId === WARZONE_APP_ID || 
                    (act.name && (act.name.toLowerCase().includes('call of duty') || act.name.toLowerCase().includes('warzone')))
                );
                if (isPlaying) warzonePlayers++;
            });

            if (warzonePlayers >= 2 && !isGameSessionActive) {
                isGameSessionActive = true;
                const alertText = "🚨 **התראת מלחמה!**\nשמעון מזהה סשן WARZONE פעיל בחדר FIFO.\n\nחברים יקרים, נא לרשום דמג' (Damage) בסוף כל סיבוב.\nלדוגמה: *עמוס 2500*\nמי שלא רושם מקבל לאפה.";
                console.log('[Monitor] 🚨 זיהוי סשן! שולח לוואטסאפ...');
                await sendToMainGroup(alertText);
            }

        } catch (err) {
            console.error('[Monitor Error]', err);
        }
    }, 60000); 
}

// --- BOT READY EVENT ---
client.once('ready', async () => {
    console.log(`⚡️ Shimon is READY! Logged in as ${client.user.tag}`);
    try {
        const { initializeCronJobs } = require('./handlers/botLifecycle');
        const { hardSyncPresenceOnReady } = require('./handlers/presenceTracker');
        const { setupVerificationMessage } = require('./handlers/verificationButton');
        const setupWelcomeImage = require('./handlers/welcomeImage');
        const { runMissedBirthdayChecks } = require('./handlers/birthdayCongratulator');

        await hardSyncPresenceOnReady(client);
        await setupVerificationMessage(client);
        initializeCronJobs(client);
        setupWelcomeImage(client);
        await runMissedBirthdayChecks(client);

        // --- ✅ הפעלת התוספים החדשים ---
        startWarzoneMonitor(); // מפעיל את העין הגדולה
        connectToWhatsApp(client); // מחבר את הוואטסאפ

        console.log("✅ All systems initialized successfully.");
    } catch (err) {
        console.error('❌ Critical error during client.ready initialization:', err);
    }
});

// --- MAIN INTERACTION ROUTER ---
const podcastManager = require('./handlers/podcastManager');

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand() && interaction.guildId) {
            if (podcastManager.getPodcastStatus()) {
                const commandName = interaction.commandName;
                if (podcastManager.restrictedCommands.includes(commandName)) {
                    return interaction.reply({ content: 'שמעון עסוק כרגע בפודקאסט ולא ניתן להפריע לו!', ephemeral: true });
                }
            }
        }

        if (interaction.isCommand() || interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            
            if(interaction.isAutocomplete() && command.autocomplete) {
                await command.autocomplete(interaction);
            } else if (interaction.isCommand()) {
                await command.execute(interaction, client);
            }
            return;
        }

        let handler;
        if (interaction.customId) {
            handler = client.interactions.get(interaction.customId);
        }
        if (!handler) {
            handler = client.dynamicInteractionHandlers.find(h => h.customId(interaction));
        }

        if (handler) {
            if (handler.type && !interaction[handler.type]()) return;
            await handler.execute(interaction, client);
        }
    } catch (error) {
        console.error('❌ שגיאה ב-interactionCreate:', error);
        const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyOptions).catch(() => {});
        } else {
            await interaction.reply(replyOptions).catch(() => {});
        }
    }
});

// --- OTHER REAL-TIME EVENT LISTENERS ---
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence } = require('./handlers/presenceTracker');
const { scanForConsoleAndVerify } = require('./handlers/verificationButton');
const statTracker = require('./handlers/statTracker');
const { handleXPMessage } = require('./handlers/engagementManager');
const { handleSpam } = require('./handlers/antispam');
const smartChat = require('./handlers/smartChat');

client.on('guildMemberAdd', async member => {
    try {
        await db.collection('memberTracking').doc(member.id).set({ guildId: member.guild.id, joinedAt: new Date().toISOString(), status: 'active' }, { merge: true });
        const verificationChannelId = process.env.VERIFICATION_CHANNEL_ID;
        if(verificationChannelId) {
            await member.send(`במידה והסתבכת — פשוט לחץ על הלינק הבא:\n\nhttps://discord.com/channels/${member.guild.id}/${verificationChannelId}\n\nזה יוביל אותך ישירות לאימות וכניסה מלאה לשרת 👋`).catch(err => console.warn(`⚠️ לא ניתן לשלוח DM ל־${member.user.tag}: ${err.message}`));
        }
        setTimeout(() => scanForConsoleAndVerify(member), 30000);
    } catch (error) {
        console.error(`Error in guildMemberAdd event for ${member.user.tag}:`, error);
    }
});

client.on('guildMemberRemove', async member => {
    await db.collection('memberTracking').doc(member.id).set({ status: 'left', leftAt: new Date().toISOString() }, { merge: true });
});

client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('presenceUpdate', (oldPresence, newPresence) => trackGamePresence(newPresence));
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    await statTracker.trackMessage(message);
    await handleXPMessage(message);
    await handleSpam(message);
    await smartChat(message);
});

// --- BOT LOGIN ---
client.login(process.env.DISCORD_TOKEN);
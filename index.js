require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes, MessageFlags } = require('discord.js');
const express = require('express'); 
const { connectToWhatsApp, sendToMainGroup } = require('./whatsapp/index');
const { startCasinoSession, endCasinoSession } = require('./whatsapp/handlers/casinoHandler');
const db = require('./utils/firebase');

// --- SERVER SETUP (RAILWAY HEALTH CHECK) --- 
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

// Load Slash Commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command?.data?.name) client.commands.set(command.data.name, command);
    } catch(err) { console.warn(`⚠️ Error loading command ${file}: ${err.message}`); }
}

// Interaction Loader
const interactionsPath = path.join(__dirname, 'interactions');
if (fs.existsSync(interactionsPath)) {
    const loadHandlers = (dir) => {
        const filesAndFolders = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of filesAndFolders) {
            const itemPath = path.join(dir, item.name);
            if (item.isDirectory()) loadHandlers(itemPath);
            else if (item.isFile() && item.name.endsWith('.js')) {
                try {
                    const handler = require(itemPath);
                    if (typeof handler.customId === 'string') client.interactions.set(handler.customId, handler);
                    else if (typeof handler.customId === 'function') client.dynamicInteractionHandlers.push(handler);
                } catch(err) {}
            }
        }
    };
    loadHandlers(interactionsPath);
}

// --- SLASH COMMAND REGISTRATION ---
(async () => {
    const slashCommands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: slashCommands },
        );
        console.log(`✅ ${slashCommands.length} Slash Commands registered.`);
    } catch (err) { console.error('❌ Slash command error:', err); }
})();

// --- 🔥 WARZONE MONITOR (העין הגדולה) ---
const WARZONE_APP_ID = '1372319014398726225'; 
let activeSessionPlayers = []; 

async function startWarzoneMonitor() {
    console.log('[Warzone Monitor] 👀 Scanning for active games...');
    
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.first();
            if (!guild) return;

            // 1. סריקת כל ערוצי הקול בשרת
            const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
            
            let currentPlayers = [];
            let currentDiscordIds = [];

            // מי משחק כרגע?
            voiceChannels.forEach(channel => {
                channel.members.forEach(member => {
                    const activities = member.presence?.activities || [];
                    const isPlaying = activities.some(act => 
                        act.applicationId === WARZONE_APP_ID || 
                        (act.name && (act.name.toLowerCase().includes('call of duty') || act.name.toLowerCase().includes('warzone')))
                    );

                    if (isPlaying) {
                        currentPlayers.push(member.displayName);
                        currentDiscordIds.push(member.id);
                    }
                });
            });

            const playerCount = currentPlayers.length;

            // --- תרחיש A: פתיחת סשן (3 שחקנים ומעלה) ---
            if (playerCount >= 3 && activeSessionPlayers.length === 0) {
                console.log('[Monitor] 🎰 Starting new session!');
                
                // מציאת טלפונים לתיוג
                let phoneNumbersToTag = [];
                for (const discordId of currentDiscordIds) {
                    const snapshot = await db.collection('whatsapp_users').where('discordId', '==', discordId).get();
                    if (!snapshot.empty) phoneNumbersToTag.push(snapshot.docs[0].id);
                }

                startCasinoSession(currentPlayers);
                activeSessionPlayers = currentDiscordIds; 

                const mentionsText = phoneNumbersToTag.map(p => `@${p}`).join(' ');
                const alertText = `🚨 **סשן WARZONE נפתח!**\nהלוחמים: ${currentPlayers.join(', ')}\n${mentionsText}\n\n💸 **הקזינו נפתח!**\nמי מסיים מקום ראשון בדמג'?\nהימרו עכשיו! (לדוגמה: "שמעון שים 100 על יוגי")`;
                
                await sendToMainGroup(alertText, phoneNumbersToTag);
            }

            // --- תרחיש B: סגירת סשן (כולם יצאו או נשאר רק 1) ---
            else if (playerCount < 2 && activeSessionPlayers.length > 0) {
                console.log('[Monitor] 🛑 Session ended.');
                
                // זיהוי מי שיחק לאחרונה
                let phoneNumbersToTag = [];
                for (const discordId of activeSessionPlayers) {
                    const snapshot = await db.collection('whatsapp_users').where('discordId', '==', discordId).get();
                    if (!snapshot.empty) phoneNumbersToTag.push(snapshot.docs[0].id);
                }

                // בדיקת שעה (האם לילה?)
                const now = new Date();
                // תיקון אזור זמן לישראל (אם השרת בחו"ל)
                const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
                const hour = israelTime.getHours();
                
                let endText = "";
                
                // אם השעה בין 00:00 ל-06:00 בבוקר
                if (hour >= 0 && hour < 6) {
                    endText = `🛑 **כולם התנתקו...**\nברחתם אה? חלשים אתם... לילה טוב נקבות. 👙\n(הקזינו נסגר להלילה)`;
                } else {
                    endText = `🛑 **הסשן נגמר!**\nהלו? לא שלחתם תמונה! 😡\nאם היה משחק טוב תשלחו צילום מסך עכשיו או תכתבו ידנית ("עשיתי 2500"), אחרת ה-XP הולך לפח.`;
                }

                await sendToMainGroup(endText, phoneNumbersToTag);
                
                endCasinoSession();
                activeSessionPlayers = [];
            }

        } catch (err) {
            console.error('[Monitor Error]', err);
        }
    }, 60000); 
}

// --- BOT READY ---
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

        startWarzoneMonitor(); // מפעיל את העין הגדולה
        connectToWhatsApp(client); // מחבר את הוואטסאפ

        console.log("✅ All systems initialized successfully.");
    } catch (err) {
        console.error('❌ Critical error during client.ready initialization:', err);
    }
});

// --- INTERACTIONS ---
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
        console.error('❌ Interaction Error:', error);
        const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyOptions).catch(() => {});
        } else {
            await interaction.reply(replyOptions).catch(() => {});
        }
    }
});

// --- EVENTS ---
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
            await member.send(`במידה והסתבכת — פשוט לחץ על הלינק הבא:\n\nhttps://discord.com/channels/${member.guild.id}/${verificationChannelId}\n\nזה יוביל אותך ישירות לאימות וכניסה מלאה לשרת 👋`).catch(err => console.warn(`⚠️ Cannot send DM to ${member.user.tag}`));
        }
        setTimeout(() => scanForConsoleAndVerify(member), 30000);
    } catch (error) { console.error('GuildMemberAdd Error:', error); }
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

client.login(process.env.DISCORD_TOKEN);
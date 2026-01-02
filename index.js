require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes, MessageFlags, ActivityType } = require('discord.js');
const express = require('express'); 

// --- חיבורים חיצוניים ---
const { connectToWhatsApp } = require('./whatsapp/index');
const db = require('./utils/firebase');
const { ensureUserExists } = require('./utils/userUtils'); // ✅ התשתית המאוחדת

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
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

client.db = db;
global.client = client;

// --- DYNAMIC HANDLER LOADING (כמו בקוד המקורי שלך) ---
client.commands = new Collection();
client.interactions = new Collection();
client.dynamicInteractionHandlers = [];

// Load Slash Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command?.data?.name) client.commands.set(command.data.name, command);
        } catch(err) { console.warn(`⚠️ Error loading command ${file}: ${err.message}`); }
    }
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


// --- BOT READY EVENT ---
client.once('ready', async () => {
    console.log(`⚡️ Shimon is READY! Logged in as ${client.user.tag}`);
    client.user.setActivity('על הגיימרים 🎮', { type: ActivityType.Watching });

    try {
        // טעינת מודולים לוגיים (Handlers)
        const { initializeCronJobs } = require('./handlers/botLifecycle');
        const { hardSyncPresenceOnReady } = require('./handlers/presenceTracker');
        const { setupVerificationMessage } = require('./handlers/verificationButton');
        const setupWelcomeImage = require('./handlers/welcomeImage');
        const { runMissedBirthdayChecks } = require('./handlers/birthdayCongratulator');

        // הפעלת שירותים
        await hardSyncPresenceOnReady(client);
        await setupVerificationMessage(client);
        initializeCronJobs(client);
        setupWelcomeImage(client);
        await runMissedBirthdayChecks(client);

        // חיבור וואטסאפ (ללא המוניטור, הוא עבר לתיקייה שלו)
        connectToWhatsApp(client); 

        console.log("✅ All systems initialized successfully.");
    } catch (err) {
        console.error('❌ Critical error during client.ready initialization:', err);
    }
});

// --- INTERACTIONS EVENT ---
const podcastManager = require('./handlers/podcastManager');

client.on('interactionCreate', async interaction => {
    try {
        // בדיקת פודקאסט (חסימת פקודות מסוימות)
        if (interaction.isCommand() && interaction.guildId) {
            if (podcastManager.getPodcastStatus()) {
                const commandName = interaction.commandName;
                if (podcastManager.restrictedCommands.includes(commandName)) {
                    return interaction.reply({ content: 'שמעון עסוק כרגע בפודקאסט ולא ניתן להפריע לו!', ephemeral: true });
                }
            }
        }

        // טיפול בפקודות (Command & Autocomplete)
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

        // טיפול באינטראקציות כלליות (Buttons, Modals, Selects)
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
        const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', ephemeral: true }; // Flags הוחלף ל-ephemeral פשוט
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyOptions).catch(() => {});
        } else {
            await interaction.reply(replyOptions).catch(() => {});
        }
    }
});

// --- DISCORD EVENTS & HANDLERS ---
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence } = require('./handlers/presenceTracker');
const { scanForConsoleAndVerify } = require('./handlers/verificationButton');
const statTracker = require('./handlers/statTracker');
const { handleXPMessage } = require('./handlers/engagementManager');
const { handleSpam } = require('./handlers/antiSpam'); // שים לב לנתיב
const smartChat = require('./handlers/smartChat');

// 👤 הצטרפות חבר - מעודכן ל-Unified DB
client.on('guildMemberAdd', async member => {
    try {
        // 1. יצירת משתמש ב-Unified DB
        await ensureUserExists(member.id, member.displayName);
        
        // 2. עדכון פרטי מעקב (במקום memberTracking הישן)
        await db.collection('users').doc(member.id).set({
            tracking: {
                guildId: member.guild.id,
                joinedAt: new Date().toISOString(),
                status: 'active'
            },
            identity: {
                displayName: member.displayName,
                fullName: member.user.username,
                discordId: member.id
            }
        }, { merge: true });

        // 3. שליחת הודעת אימות
        const verificationChannelId = process.env.VERIFICATION_CHANNEL_ID;
        if(verificationChannelId) {
            await member.send(`במידה והסתבכת — פשוט לחץ על הלינק הבא:\n\nhttps://discord.com/channels/${member.guild.id}/${verificationChannelId}\n\nזה יוביל אותך ישירות לאימות וכניסה מלאה לשרת 👋`).catch(err => console.warn(`⚠️ Cannot send DM to ${member.user.tag}`));
        }
        
        // 4. סריקת קונסולות
        setTimeout(() => scanForConsoleAndVerify(member), 30000);

    } catch (error) { console.error('GuildMemberAdd Error:', error); }
});

// 👋 עזיבת חבר - מעודכן ל-Unified DB
client.on('guildMemberRemove', async member => {
    try {
        await db.collection('users').doc(member.id).set({
            tracking: {
                status: 'left',
                leftAt: new Date().toISOString()
            }
        }, { merge: true });
    } catch (e) { console.error('GuildMemberRemove Error:', e); }
});

// שאר האירועים נשארים זהים
client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('presenceUpdate', (oldPresence, newPresence) => trackGamePresence(newPresence));

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // סדר הפעולות: מעקב -> XP -> ספאם -> צ'אט
    await statTracker.trackMessage(message); // כותב ל-Unified DB (Users)
    await handleXPMessage(message);          // כותב ל-Unified DB (Users)
    await handleSpam(message);
    await smartChat.handleSmartReply(message); // הנחה שזה export בשם handleSmartReply או הפונקציה עצמה
});

client.login(process.env.DISCORD_TOKEN);
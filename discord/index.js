// 📁 discord/index.js
// --- שלב 0: בולמי זעזועים (חייב להיות ראשון) ---
process.on('unhandledRejection', (reason, promise) => {
    // השתקה מוחלטת של שגיאת ה-Timeout המפורסמת
    if (reason && (reason.code === 'GuildMembersTimeout' || reason.message?.includes('Members didn\'t arrive'))) {
        return; 
    }
    console.error('❌ [Critical Error] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    if (error && (error.code === 'GuildMembersTimeout' || error.message?.includes('Members didn\'t arrive'))) {
        return;
    }
    console.error('❌ [Critical Error] Uncaught Exception:', error);
});

// --- שלב 1: טעינת ספריות ---
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const scheduler = require('../handlers/scheduler');
const birthdayManager = require('../handlers/birthday/manager');

// --- שלב 2: הגדרת הקליינט ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();
const commandsData = []; 

// טעינת פקודות
function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data && command.data.name) {
                    client.commands.set(command.data.name, command);
                    commandsData.push(command.data.toJSON());
                }
            } catch (error) {
                console.error(`[Load Error] ${fullPath}:`, error);
            }
        }
    }
}

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) loadCommands(commandsPath);

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) client.once(event.name, (...args) => event.execute(...args));
        else client.on(event.name, (...args) => event.execute(...args));
    }
}

// --- שלב 3: חיסול זומבים (Graceful Shutdown) ---
// כשרייל שולח סיגנל סגירה, אנחנו הורגים את הכל מיד כדי למנוע כפילות
const shutdown = () => {
    log('🛑 Shutting down gracefully...');
    client.destroy();
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// --- שלב 4: עלייה לאוויר ---
client.once('ready', async () => {
    log(`🤖 [Discord] Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const guildId = process.env.GUILD_ID;
        const clientId = client.user.id;
        
        if (guildId) {
            // ניקוי גלובלי והפצה מקומית (מונע כפילויות בסלאש)
            await rest.put(Routes.applicationCommands(clientId), { body: [] });
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsData });
            log('[System] ✅ Commands synced to Guild (Instant).');
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body: commandsData });
        }
    } catch (error) {
        console.error('[System] ❌ Deploy Error:', error);
    }

    if (birthdayManager?.init) birthdayManager.init(client, null, null, null);
    if (scheduler?.initScheduler) scheduler.initScheduler(client);
});

client.login(process.env.DISCORD_TOKEN);

module.exports = client;
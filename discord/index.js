// 📁 discord/index.js
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const scheduler = require('../handlers/scheduler');
const birthdayManager = require('../handlers/birthday/manager');

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
                console.error(`[ERROR] Load command failed: ${fullPath}`, error);
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

// --- Anti-Crash & Error Suppression ---
// משתיק לחלוטין את שגיאות ה-Timeout המציקות
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.code === 'GuildMembersTimeout') return; 
    if (reason && reason.message && reason.message.includes('Members didn\'t arrive')) return;
    console.error('❌ [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (error) => {
    if (error && error.code === 'GuildMembersTimeout') return;
    console.error('❌ [Uncaught Exception]:', error);
});

// --- Graceful Shutdown (Zombie Killer) ---
// מבטיח שהבוט ימות כשרייל מבקש, ולא ישאיר תהליך תקוע
process.on('SIGTERM', () => {
    log('🛑 SIGTERM received. Closing connections...');
    client.destroy();
    process.exit(0);
});

client.once('ready', async () => {
    log(`🤖 [Discord] Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const guildId = process.env.GUILD_ID;
        const clientId = client.user.id;
        
        if (guildId) {
            log(`[System] 🧹 Cleaning global commands...`);
            await rest.put(Routes.applicationCommands(clientId), { body: [] });

            log(`[System] 🔄 Deploying ${commandsData.length} commands to Guild (${guildId})...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commandsData },
            );
            log('[System] ✅ Commands registered successfully!');
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
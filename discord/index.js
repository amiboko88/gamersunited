// 📁 discord/index.js
const { Client, GatewayIntentBits, Collection, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger'); // וודא שהנתיב ללוגר תקין

// --- בולמי זעזועים ---
process.on('unhandledRejection', (reason) => {
    if (reason?.code === 'GuildMembersTimeout') return;
    console.error('❌ [Discord Error] Unhandled Rejection:', reason);
});

// --- הגדרת הקליינט ---
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

// --- טעינת פקודות ---
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
                console.error(`[Load Error] ${file.name}:`, error);
            }
        }
    }
}

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) loadCommands(commandsPath);

// --- טעינת אירועים ---
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) client.once(event.name, (...args) => event.execute(...args));
        else client.on(event.name, (...args) => event.execute(...args));
    }
}

// --- פונקציות הפעלה וכיבוי (Exported) ---

async function launchDiscord() {
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ [Discord] Missing Token!');
        return;
    }
    
    // Deploy Commands (רק בעלייה)
    client.once('ready', async () => {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
             // שים לב: זה יבצע רישום גלובלי או לשרת ספציפי תלוי ב-ENV
            const route = process.env.GUILD_ID 
                ? Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID)
                : Routes.applicationCommands(client.user.id);
            
            await rest.put(route, { body: commandsData });
            console.log('[System] ✅ Discord Commands Synced.');
        } catch (error) {
            console.error('[System] ❌ Deploy Error:', error);
        }
    });

    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('❌ [Discord] Login Failed:', error);
    }
}

async function stopDiscord() {
    if (client && client.isReady()) {
        console.log("🛑 [DISCORD] מנתק חיבור...");
        await client.destroy();
    }
}

module.exports = { client, launchDiscord, stopDiscord };
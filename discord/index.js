// 📁 discord/index.js
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

// ייבוא המערכות הקריטיות
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

// פונקציה לטעינה רקורסיבית של פקודות
function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
            // כניסה לתיקייה פנימית
            loadCommands(fullPath);
        } else if (file.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data && command.data.name) {
                    client.commands.set(command.data.name, command);
                    // log(`[Command] ✅ נטענה הפקודה: ${command.data.name}`);
                } else {
                    console.warn(`[WARNING] הפקודה ב-${fullPath} חסרה מאפיין "data" או "name".`);
                }
            } catch (error) {
                console.error(`[ERROR] נכשל בטעינת פקודה ${fullPath}:`, error);
            }
        }
    }
}

// 1. טעינת פקודות (Commands)
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    loadCommands(commandsPath); // שימוש בטעינה הרקורסיבית
    log(`[System] ✅ סה"כ נטענו ${client.commands.size} פקודות סלאש.`);
}

// 2. טעינת אירועים (Events)
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// 3. אירוע עלייה לאוויר (Ready)
client.once('ready', () => {
    log(`🤖 [Discord] Logged in as ${client.user.tag}`);

    // אתחול מערכת ימי הולדת
    if (birthdayManager && typeof birthdayManager.init === 'function') {
        birthdayManager.init(client, null, null, null);
    }

    // אתחול המתזמן הראשי
    if (scheduler && typeof scheduler.initScheduler === 'function') {
        scheduler.initScheduler(client);
    }
});

client.login(process.env.DISCORD_TOKEN);

module.exports = client;
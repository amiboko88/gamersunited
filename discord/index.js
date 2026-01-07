// 📁 discord/index.js
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const scheduler = require('../handlers/scheduler'); // הטעינה החדשה

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message] // תמיכה ב-DM
});

client.commands = new Collection();

// 1. טעינת פקודות
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        client.commands.set(command.data.name, command);
    }
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

// 3. אירוע עלייה לאוויר (מוגדר כאן או בנפרד)
client.once('ready', () => {
    log(`🤖 [Discord] Logged in as ${client.user.tag}`);
    scheduler.initScheduler(client); // הפעלת השעונים
});

// כניסה
client.login(process.env.DISCORD_TOKEN);

module.exports = client;
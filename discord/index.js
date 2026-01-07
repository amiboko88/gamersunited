// 📁 discord/index.js
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

// ✅ ייבוא המערכות הקריטיות להפעלה
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
    partials: [Partials.Channel, Partials.Message] // תמיכה ב-DM
});

client.commands = new Collection();

// 1. טעינת פקודות (Commands)
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
        } else {
            console.warn(`[WARNING] The command at ${file} is missing a required "data" or "data.name" property.`);
        }
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

// 3. אירוע עלייה לאוויר (Ready)
client.once('ready', () => {
    log(`🤖 [Discord] Logged in as ${client.user.tag}`);

    // ✅ אתחול מערכת ימי הולדת (Discord Client)
    // הערה: את הוואטסאפ והטלגרם נחבר אליו דרך ה-Manager הראשי, אבל חשוב שהוא יכיר את דיסקורד כבר עכשיו
    birthdayManager.init(client, null, null, null);

    // ✅ אתחול המתזמן הראשי (הלב של המערכת)
    // זה מפעיל את ה-Cron Jobs, ה-Status Rotator, ואת הניקיונות
    scheduler.initScheduler(client);
});

// כניסה
client.login(process.env.DISCORD_TOKEN);

module.exports = client;
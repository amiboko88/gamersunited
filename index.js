// 📁 index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const express = require('express'); 

// --- מודולים פנימיים ---
const telegramBot = require('./telegram/shimonTelegram');
const { registerDiscordEvents } = require('./handlers/discordEvents');
const { handleInteractions } = require('./handlers/interactionHandler');
const botLifecycle = require('./handlers/botLifecycle');
const welcomeImage = require('./handlers/welcomeImage');

// --- 🛡️ טיפול בשגיאות קריטיות (מונע קריסה שקטה) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
    // לא עוצרים את הבוט, רק מתעדים
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
    // במקרה חמור אולי נרצה לעשות restart, אבל כרגע נשאיר אותו חי
});

// --- Server Setup (Railway / Telegram Webhook) ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());

app.get('/', (req, res) => res.send('Shimon Bot is Alive & Kicking 🤖'));

if (process.env.RAILWAY_STATIC_URL) {
    const { webhookCallback } = require("grammy");
    app.use("/telegram", webhookCallback(telegramBot.bot, "express")); 
    console.log(`🔗 Telegram Webhook set to: ${process.env.RAILWAY_STATIC_URL}/telegram`);
}

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// משתנה גלובלי לשימוש בלוגרים
global.client = client;

client.commands = new Collection();
const commandsPath = require('path').join(__dirname, 'commands');
const commandFiles = require('fs').readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = require('path').join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
    }
}

// --- הרשמת אירועים ---
registerDiscordEvents(client);
welcomeImage(client);

// --- ניהול אינטראקציות ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const reply = { content: '❌ אירעה שגיאה בביצוע הפקודה!', flags: 64 }; // Ephemeral
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        }
        return;
    }
    await handleInteractions(interaction, client);
});

// --- הפעלת הבוט ---
(async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        
        // אתחול מחזור החיים (Crons) רק אחרי שהבוט מחובר
        client.once('ready', () => {
            console.log(`✅ Discord Bot Logged in as ${client.user.tag}`);
            botLifecycle.init(client);
        });

        // הפעלת שרת Express
        app.listen(PORT, () => {
            console.log(`🚀 Server listening on port ${PORT}`);
        });

    } catch (error) {
        console.error('Fatal Error during startup:', error);
    }
})();
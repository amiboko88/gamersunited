// 📁 index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const express = require('express'); 

// --- ייבוא מודולים ---
const telegramBot = require('./telegram/shimonTelegram');
const { registerDiscordEvents } = require('./handlers/discordEvents');
const { handleInteractions } = require('./handlers/interactionHandler');
const botLifecycle = require('./handlers/botLifecycle');
const welcomeImage = require('./handlers/welcomeImage');

// ✅ התיקון הקריטי: ייבוא המנוע של וואטסאפ
const { connectToWhatsApp } = require('./whatsapp/index'); 

// --- 🛡️ טיפול בשגיאות קריטיות (Anti-Crash) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', error);
});

// --- Server Setup (Railway / Telegram Webhook) ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());

// Health Check פשוט ל-Railway
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

global.client = client;

client.commands = new Collection();
const commandsPath = require('path').join(__dirname, 'commands');
const commandFiles = require('fs').readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = require('path').join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
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
            const reply = { content: '❌ אירעה שגיאה בביצוע הפקודה!', flags: 64 };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        }
        return;
    }
    await handleInteractions(interaction, client);
});

// --- 🚀 הפעלת הבוט (Main Entry Point) ---
(async () => {
    try {
        // 1. חיבור לדיסקורד
        await client.login(process.env.DISCORD_TOKEN);
        
        client.once('ready', () => {
            console.log(`✅ Discord Bot Logged in as ${client.user.tag}`);
            
            // 2. אתחול משימות רקע (Crons)
            botLifecycle.init(client);

            // 3. ✅ הפעלת הוואטסאפ (היה חסר!)
            console.log('🔄 [System] Initializing WhatsApp...');
            connectToWhatsApp().catch(err => console.error('❌ WhatsApp Init Failed:', err));
        });

        // 4. הפעלת השרת
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server listening on port ${PORT}`);
        });

    } catch (error) {
        console.error('❌ Fatal Error during startup:', error);
    }
})();
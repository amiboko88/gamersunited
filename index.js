// 📁 index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const express = require('express'); 

// --- מודולים פנימיים ---
const { connectToWhatsApp } = require('./whatsapp/index');
const telegramBot = require('./telegram/shimonTelegram'); // הבוט של טלגרם
const { registerDiscordEvents } = require('./handlers/discordEvents');
const { handleInteractions } = require('./handlers/interactionHandler');
const botLifecycle = require('./handlers/botLifecycle');
const welcomeImage = require('./handlers/welcomeImage'); // קובץ זה רושם לעצמו את ה-Listener

// --- Server Setup (Railway / Telegram Webhook) ---
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());

// נתיב בריאות
app.get('/', (req, res) => res.send('Shimon Bot is Alive & Kicking 🤖'));

// חיבור Webhook לטלגרם (במקום ש-shimonTelegram ירים שרת משלו)
if (process.env.RAILWAY_STATIC_URL) {
    const { webhookCallback } = require("grammy");
    app.use("/telegram", webhookCallback(telegramBot.bot, "express")); 
    // הערה: וודא ש-shimonTelegram מייצא את bot בשם .bot או שתשנה שם בהתאם
    console.log('🔗 Telegram Webhook Mounted on /telegram');
}

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

// --- Discord Client Setup ---
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

// משתנה גלובלי (עבור logger וקבצי utils)
global.client = client;

client.commands = new Collection();

// --- טעינת פקודות (Commands) ---
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
    }
}

// --- הרשמת אירועים ---
registerDiscordEvents(client); // אירועי צ'אט, כניסה, קול
welcomeImage(client);          // תמונת ברוך הבא

// --- ניהול אינטראקציות (הפניה לנתב הראשי) ---
client.on('interactionCreate', async interaction => {
    // 1. פקודות סלאש
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const reply = { content: '❌ אירעה שגיאה בביצוע הפקודה!', ephemeral: true };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        }
        return;
    }

    // 2. כל השאר (כפתורים, מודאלים, תפריטים) -> לנתב
    await handleInteractions(interaction, client);
});

// --- הפעלת הבוט ---
(async () => {
    try {
        // 1. התחברות ל-Discord
        await client.login(process.env.TOKEN);
        
        // 2. הפעלת מחזור חיים (Cron jobs וכו')
        await botLifecycle.init(client);

        // 3. התחברות לוואטסאפ (במקביל)
        connectToWhatsApp();

    } catch (error) {
        console.error('❌ CRITICAL STARTUP ERROR:', error);
    }
})();
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
});

client.once('ready', () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
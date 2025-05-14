
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`🤖 הבוט באוויר: ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.login(process.env.DISCORD_TOKEN);

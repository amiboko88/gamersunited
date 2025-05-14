
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

const { startCleanupScheduler } = require('./handlers/channelCleaner');

// אחרי client.once('ready', ...)
client.once('ready', () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);
  startCleanupScheduler(client); // ← כאן אנחנו מחברים את מנגנון הניקוי
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.login(process.env.DISCORD_TOKEN);

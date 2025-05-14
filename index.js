
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence, validatePresenceOnReady } = require('./handlers/presenceTracker');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const { startCleanupScheduler } = require('./handlers/channelCleaner');

// אחרי client.once('ready', ...)
client.once('ready', () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);
  startCleanupScheduler(client); // ← כאן אנחנו מחברים את מנגנון הניקוי
  validatePresenceOnReady(client); // ← בודק נוכחות גם כשעולה
});

client.on('presenceUpdate', (_, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.login(process.env.DISCORD_TOKEN);

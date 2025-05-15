require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence, validatePresenceOnReady } = require('./handlers/presenceTracker');
const {
  checkMVPStatusAndRun,
  registerMvpCommand,
  handleMvpInteraction
} = require('./handlers/mvpTracker');
const db = require('./utils/firebase');
const { startCleanupScheduler } = require('./handlers/channelCleaner');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// רישום Slash Commands
const commands = [];
registerMvpCommand(commands);

client.once('ready', async () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  startCleanupScheduler(client); // ניקוי חדרים
  await validatePresenceOnReady(client); // בדיקת תפקידים למשחקים
  await checkMVPStatusAndRun(client, db); // בדיקת MVP אוטומטית
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('interactionCreate', interaction => {
  handleMvpInteraction(interaction, client, db); // טיפול ב־/mvp
});

client.login(process.env.DISCORD_TOKEN);

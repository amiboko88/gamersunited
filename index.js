
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
client.once('ready', async () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  startCleanupScheduler(client); // זה יכול להישאר בלי await אם לא צריך
  validatePresenceOnReady(client); // גם זה – תלוי אם הוא אסינכרוני

  await checkMVPStatusAndRun(client, db); // ← זה חייב להיות await כדי לוודא שזה נגמר
});

client.on('presenceUpdate', (_, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.login(process.env.DISCORD_TOKEN);

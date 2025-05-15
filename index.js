require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
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

  // ✅ רישום Slash Commands אוטומטי לשרת
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = client.guilds.cache.first().id;

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );
    console.log('✅ פקודות Slash עודכנו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }

  startCleanupScheduler(client); // ניקוי חדרים
  await validatePresenceOnReady(client); // תפקידים לפי משחק
  await checkMVPStatusAndRun(client, db); // MVP אוטומטי
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

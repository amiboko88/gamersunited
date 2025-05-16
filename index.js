require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence, validatePresenceOnReady } = require('./handlers/presenceTracker');
const { checkMVPStatusAndRun } = require('./handlers/mvpTracker'); // ✅ רק check נשאר פה
const { registerMvpCommand } = require('./commands/mvpDisplay');   // ✅ עכשיו פה
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
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
commands.push(soundData); // ← פקודת /סאונד

client.once('ready', async () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  // ✅ רישום Slash Commands לשרת
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

  startCleanupScheduler(client); // ניקוי חדרים ריקים
  await validatePresenceOnReady(client); // עדכון תפקידים לפי משחק
  await checkMVPStatusAndRun(client, db); // MVP שבועי
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('interactionCreate', interaction => {
  if (interaction.commandName === 'סאונד') return soundExecute(interaction, client);
  if (interaction.commandName === 'mvp') return mvpDisplayExecute(interaction, client);
});

client.login(process.env.DISCORD_TOKEN);

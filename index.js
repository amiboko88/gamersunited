require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

// 📦 פקודות Slash
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { registerMvpCommand } = require('./commands/mvpDisplay');

// 🎧 ניהול קולי
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const handleMusicControls = require('./handlers/musicControls');

// 🔒 ווריפיקציה
const {
  setupVerificationMessage,
  startDmTracking,
  handleInteraction: handleVerifyInteraction
} = require('./handlers/verificationButton');

// 📈 נוכחות
const {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
} = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');

// 🎯 MVP וסטטיסטיקות
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 🧼 ניהול כללי
const { setupMemberTracker } = require('./handlers/memberTracker');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { handleSpam } = require('./handlers/antispam');
const db = require('./utils/firebase');

// 🎮 אתחול הבוט
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

client.db = db;

// 🎯 רישום Slash Commands
const commands = [];
registerMvpCommand(commands);
commands.push(verifyData);
commands.push(songData);
commands.push(soundData);

// 🔁 אתחול
client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  startDmTracking(client);
  startPresenceLoop(client);
  startPresenceRotation(client);
  setupMemberTracker(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);

  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

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
});

// 📡 נוכחות
client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

// 🎤 קול
client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// 🧼 ספאם
client.on('messageCreate', handleSpam);

// ⚙️ אינטראקציות
client.on('interactionCreate', async interaction => {
  // 🔎 Autocomplete
  if (interaction.isAutocomplete()) {
    return songAutocomplete(interaction);
  }

  // 🔘 כפתורים
  if (interaction.isButton()) {
    handleMusicControls(interaction);
    return handleVerifyInteraction(interaction);
  }

  // 💬 Slash Commands
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'שיר') return songExecute(interaction, client);
  if (commandName === 'סאונד') return soundExecute(interaction, client);
  if (commandName === 'אמת') return verifyExecute(interaction);
  if (commandName === 'mvp') return mvpDisplayExecute(interaction, client);
});

// ▶️ התחברות
client.login(process.env.DISCORD_TOKEN);

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { registerMvpCommand } = require('./commands/mvpDisplay');

const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { handleSpam } = require('./handlers/antispam');
const handleMusicControls = require('./handlers/musicControls');
const {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
} = require('./handlers/presenceTracker');
const {
  setupVerificationMessage,
  startDmTracking,
  handleInteraction: handleVerifyInteraction
} = require('./handlers/verificationButton');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const db = require('./utils/firebase');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

client.db = db; // ✅ גישה לפיירסטור

// ⬇️ רישום Slash Commands
const commands = [];
registerMvpCommand(commands);
commands.push(verifyData);
commands.push(songData);
commands.push(soundData);

client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);     // ריצה על כל המשתמשים
  await setupVerificationMessage(client);    // שליחת Embed אם אין
  startPresenceLoop(client);                 // סריקה מתוזמנת כל 2 דקות
  startPresenceRotation(client);             // סטטוסים
  startDmTracking(client);                   // מעקב אחרי משתמשים שלא אומתו
  setupMemberTracker(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);

  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  // 🔁 רישום Slash Commands לשרת
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

// 🎮 עדכון תפקיד לפי נוכחות
client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

// 🎤 ניטור TTS וקולי
client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// 🧼 אנטי־ספאם
client.on('messageCreate', handleSpam);

// ⚙️ אינטראקציות
client.on('interactionCreate', async interaction => {
  // השלמה אוטומטית
  if (interaction.isAutocomplete()) {
    return songAutocomplete(interaction);
  }

  // כפתורים
  if (interaction.isButton()) {
    handleMusicControls(interaction);
    return handleVerifyInteraction(interaction);
  }

  // Slash
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'שיר') return songExecute(interaction, client);
  if (commandName === 'סאונד') return soundExecute(interaction, client);
  if (commandName === 'אמת') return verifyExecute(interaction);
  if (commandName === 'mvp') return mvpDisplayExecute(interaction, client);
});

client.login(process.env.DISCORD_TOKEN);

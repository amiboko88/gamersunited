require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
} = require('./handlers/presenceTracker');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const {
  setupVerificationMessage,
  startDmTracking,
  handleInteraction: handleVerifyInteraction
} = require('./handlers/verificationButton');
const { registerMvpCommand } = require('./commands/mvpDisplay');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleSpam } = require('./handlers/antispam');
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

client.db = db; // ✅ חשוב מאוד – גישה לפיירסטור

// ⬇️ רישום Slash Commands
const commands = [];
registerMvpCommand(commands);
commands.push(verifyData);
commands.push(soundData);

client.once('ready', async () => {
  await hardSyncPresenceOnReady(client); // ריצה מלאה על כל המשתמשים כולל אופליין
  startPresenceLoop(client);
  await setupVerificationMessage(client); // שליחת Embed אם צריך
  startDmTracking(client); // מעקב DM למשתמשים שלא אומתו
  startPresenceRotation(client);
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  // ✅ רישום Slash לשרת
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

  setupMemberTracker(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('messageCreate', handleSpam);

client.on('interactionCreate', interaction => {
  handleVerifyInteraction(interaction); // טיפול בלחיצת כפתור אימות
  if (interaction.commandName === 'סאונד') return soundExecute(interaction, client);
  if (interaction.commandName === 'אמת') return verifyExecute(interaction);
  if (interaction.commandName === 'mvp') return mvpDisplayExecute(interaction, client);
});

client.login(process.env.DISCORD_TOKEN);

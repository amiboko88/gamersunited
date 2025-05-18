require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence, validatePresenceOnReady } = require('./handlers/presenceTracker');
const { startMvpScheduler } = require('./handlers/mvpTracker'); // ✅ במקום checkMVPStatusAndRun
const { registerMvpCommand } = require('./commands/mvpDisplay');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleVoiceJoinGreeter } = require('./handlers/interactionGreeter');
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
commands.push(soundData); // ← כולל /סאונד

client.once('ready', async () => {
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

  // ⚙️ הפעלות ראשוניות
  setupMemberTracker(client);
  startCleanupScheduler(client);
  await validatePresenceOnReady(client);

  // 🔁 נוכחות לפי משחק – כל 5 דקות
  setInterval(() => {
    validatePresenceOnReady(client);
  }, 1000 * 60 * 5);

  // 🕒 התחלת מנגנון MVP לפי שעון ישראל – פעם בדקה בלבד
  startMvpScheduler(client, db);

  // 🏅 מעקב ריאקטים ל־MVP
  await startMvpReactionWatcher(client, db);
});

// 🎮 נוכחות
client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

// 🎤 TTS ו־Greeting
client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
  handleVoiceJoinGreeter(oldState, newState, client);
});

// 🧼 אנטי־ספאם
client.on('messageCreate', handleSpam);

// 📩 Slash
client.on('interactionCreate', interaction => {
  if (interaction.commandName === 'סאונד') return soundExecute(interaction, client);
  if (interaction.commandName === 'mvp') return mvpDisplayExecute(interaction, client);
});

client.login(process.env.DISCORD_TOKEN);

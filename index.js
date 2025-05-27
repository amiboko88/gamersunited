// 📁 index.js
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

// 📘 חוקים
const {
  sendPublicRulesEmbed,
  sendRulesToUser,
  handleRulesInteraction,
  startWeeklyRulesUpdate
} = require('./handlers/rulesEmbed');

// 📦 פקודות Slash
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { data: birthdayCommands, execute: birthdayExecute } = require('./commands/birthdayCommands');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { registerMvpCommand } = require('./commands/mvpDisplay');

// 🧠 משחקים וחגים
const { startMiniGameScheduler } = require('./handlers/miniGames');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');

// 🎧 ניהול קולי
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const handleMusicControls = require('./handlers/musicControls');

// 🤖 אינטראקציות חכמות
const smartChat = require('./handlers/smartChat');
const { startActivityScheduler } = require('./handlers/activityScheduler');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./handlers/birthdayModal');

// 🔒 אימות
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

// 🎯 MVP
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 🧼 כללי
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { data: leaderboardData, execute: leaderboardExecute } = require('./commands/leaderboard');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { data: refreshRulesData, execute: refreshRulesExecute } = require('./commands/refreshRules');
const { data: rulesStatsData, execute: rulesStatsExecute } = require('./commands/rulesStats');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { handleSpam } = require('./handlers/antispam');
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker'); // ✅ חדש

// 🎮 אתחול הבוט
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.db = db;

// פקודות
const commands = [];
registerMvpCommand(commands);
commands.push(verifyData, songData, soundData);
commands.push(...birthdayCommands);
commands.push(leaderboardData);
commands.push(rulesStatsData);
commands.push(refreshRulesData);

// ▶️ התחברות
client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
   await sendPublicRulesEmbed(client); // ✅ חדש
  startWeeklyRulesUpdate(client);  // ✅ חדש
  startDmTracking(client);
  startLeaderboardUpdater(client);
  startPresenceLoop(client);
  startPresenceRotation(client);
  startActivityScheduler(client);
  setupMemberTracker(client);
  startBirthdayTracker(client);
  startWeeklyBirthdayReminder(client);
  startMiniGameScheduler(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);

  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

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

client.on('guildMemberAdd', async member => {
  await sendRulesToUser(member); // ✅ שולח DM רק למי שצריך
});


// 💬 טקסט
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  await statTracker.trackMessage(message); // ✅ חדש

  const lowered = message.content.toLowerCase();
  const targetBot = lowered.includes('שמעון') || lowered.includes('bot') || lowered.includes('shim');
  const curseWords = require('./handlers/antispam').allCurseWords;
  const hasCurse = curseWords.some(w => lowered.includes(w));

  if (targetBot && hasCurse) {
    return smartChat(message);
  }

  await handleSpam(message);
  await smartChat(message);
});

// ⚙️ אינטראקציות
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) return songAutocomplete(interaction);

  if (interaction.isButton()) {
    if (['pause', 'resume', 'stop'].includes(interaction.customId)) {
      return handleMusicControls(interaction);
    }

    if (interaction.customId === 'open_birthday_modal') {
      return showBirthdayModal(interaction);
    }

    if (interaction.customId.startsWith('rules_') || interaction.customId === 'accept_rules') {
      return handleRulesInteraction(interaction); // ✅ חדש
    }

    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayModalSubmit(interaction, client);
  }

  if (!interaction.isCommand()) return;

  await statTracker.trackSlash(interaction); // ✅ חדש

  const { commandName } = interaction;

  if (commandName === 'שיר') return songExecute(interaction, client);
  if (commandName === 'עדכן_חוקים') return refreshRulesExecute(interaction);
  if (commandName === 'אישרו_חוקים') return rulesStatsExecute(interaction);
  if (commandName === 'לוח_פעילות') return leaderboardExecute(interaction);
  if (commandName === 'סאונד') return soundExecute(interaction, client);  
  if (commandName === 'אמת') return verifyExecute(interaction);
  if (commandName === 'mvp') return mvpDisplayExecute(interaction, client);

  if ([
    'הוסף_יום_הולדת',
    'ימי_הולדת',
    'היום_הולדת_הבא',
    'ימי_הולדת_חסרים'
  ].includes(commandName)) {
    return birthdayExecute(interaction);
  }
});

// 🚀 הפעלה
client.login(process.env.DISCORD_TOKEN);

// 🧪 ניטור קריסות והודעות מערכת
process.on('exit', (code) => {
  console.log(`[EXIT] התהליך הסתיים עם קוד: ${code}`);
});

process.on('SIGTERM', () => {
  console.log('[SIGTERM] התקבלה בקשת סיום מהמערכת');
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
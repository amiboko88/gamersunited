require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');

// 📦 ייבוא פיצ'רים ותשתיות
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');
const smartChat = require('./handlers/smartChat');

// 🎮 Schedulers
const { startStatsUpdater } = require('./handlers/statsUpdater');
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { startPresenceLoop, trackGamePresence, hardSyncPresenceOnReady } = require('./handlers/presenceTracker');
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { startWeeklyRulesUpdate } = require('./handlers/rulesEmbed');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');

// 👥 מערכת ניטור פעילות
const { setupMemberTracker } = require('./handlers/memberTracker');
const { handleXPMessage, rankCommand } = require('./handlers/engagementManager');

// 🔊 מערכות נוספות
const handleMusicControls = require('./handlers/musicControls');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./handlers/birthdayModal');
const welcomeImage = require('./handlers/welcomeImage');
const { handleSpam } = require('./handlers/antispam');
const { sendRulesToUser, sendPublicRulesEmbed } = require('./handlers/rulesEmbed');

// 🧾 אימות
const {
  setupVerificationMessage,
  startDmTracking,
  handleInteraction: handleVerifyInteraction
} = require('./handlers/verificationButton');

// 🧠 ניהול אינטראקציות
const handleInteraction = require('./handlers/interactionHandler');

// 📘 Slash Commands
const {
  data: verifyData, execute: verifyExecute
} = require('./commands/verify');
const {
  data: recordData, execute: recordExecute
} = require('./commands/voiceRecorder');
const {
  data: playbackData, execute: playbackExecute
} = require('./commands/voicePlayback');
const {
  data: listData, execute: listExecute
} = require('./commands/voiceList');
const {
  data: deleteData, execute: deleteExecute
} = require('./commands/voiceDelete');
const {
  data: fifoData, execute: fifoExecute
} = require('./commands/fifo');
const {
  data: songData, execute: songExecute, autocomplete: songAutocomplete
} = require('./commands/song');
const {
  data: birthdayCommands, execute: birthdayExecute
} = require('./commands/birthdayCommands');
const {
  execute: mvpDisplayExecute,
  registerMvpCommand
} = require('./commands/mvpDisplay');
const {
  data: leaderboardData, execute: leaderboardExecute
} = require('./commands/leaderboard');
const {
  data: refreshRulesData, execute: refreshRulesExecute
} = require('./commands/refreshRules');
const {
  data: rulesStatsData, execute: rulesStatsExecute
} = require('./commands/rulesStats');
const ttsCommand = require('./commands/ttsCommand');
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { inactivityCommand } = require('./handlers/memberTracker');

// 🧾 רישום Slash Commands
const commands = [];
registerMvpCommand(commands);
commands.push(
  rankCommand.data,
  inactivityCommand.data,
  recordData,
  playbackData,
  listData,
  deleteData,
  helpData,
  verifyData,
  songData,
  soundData,
  ...birthdayCommands,
  leaderboardData,
  fifoData,
  rulesStatsData,
  ttsCommand.data,
  refreshRulesData
);

// 🤖 יצירת בוט
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

// ▶️ הפעלת בוט
client.once('ready', async () => {
  console.log(`🟢 ${client.user.tag} באוויר`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

  try {
    // 🧹 מחיקה של כל Slash Commands הקיימים
    const existing = await rest.get(
      Routes.applicationGuildCommands(client.user.id, guildId)
    );

    for (const cmd of existing) {
      await rest.delete(
        Routes.applicationGuildCommand(client.user.id, guildId, cmd.id)
      );
      console.log(`🗑️ נמחקה פקודה ישנה: /${cmd.name}`);
    }

    // 📘 רישום Slash Commands חדשים
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );
    console.log('✅ Slash Commands נרשמו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה בניהול Slash:', err);
  }

  // ▶️ סקריפטים וכל השאר
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  await sendPublicRulesEmbed(client);
  startFifoWarzoneAnnouncer(client);
  startStatsUpdater(client);
  startWeeklyRulesUpdate(client);
  welcomeImage(client);
  startDmTracking(client);
  startLeaderboardUpdater(client);
  startPresenceLoop(client);
  startPresenceRotation(client);
  setupMemberTracker(client);
  startWeeklyBirthdayReminder(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);
});


// 📥 אירועים
client.on('guildMemberAdd', async member => sendRulesToUser(member));
client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('presenceUpdate', (old, now) => trackGamePresence(now));

// 💬 הודעות
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await statTracker.trackMessage(message);
  await handleXPMessage(message);
  const lowered = message.content.toLowerCase();
  const shouldRespond = ['שמעון', 'shim', 'bot'].some(word => lowered.includes(word));
  const hasCurse = require('./handlers/antispam').allCurseWords.some(w => lowered.includes(w));
  if (shouldRespond && hasCurse) return smartChat(message);
  await handleSpam(message);
  await smartChat(message);
});

// ⚙️ אינטראקציות
client.on('interactionCreate', interaction => handleInteraction(interaction, client));

// 🟢 התחברות
client.login(process.env.DISCORD_TOKEN);

// 🧪 ניטור שגיאות מערכת
process.on('exit', code => console.log(`[EXIT] קוד יציאה: ${code}`));
process.on('SIGTERM', () => console.log('[SIGTERM] סיום תהליך'));
process.on('uncaughtException', err => console.error('[UNCAUGHT EXCEPTION]', err));
process.on('unhandledRejection', reason => console.error('[UNHANDLED REJECTION]', reason));

// 📡 שמירה על חיות
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

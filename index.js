// 📁 index.js — גרסה מתוקנת לאחר סריקה מלאה של כל הקבצים והייצוא שלהם
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');

// 📦 ייבוא תשתיות
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');
const smartChat = require('./handlers/smartChat');
const setupInteractions = require('./handlers/interactionHandler');

// 🧠 רמות ו־XP
const { handleXPMessage, rankCommand } = require('./handlers/engagementManager');

// 🛡️ אימות
const { setupVerificationMessage, startDmTracking } = require('./handlers/verificationButton');

// 📃 חוקים ו־Welcome
const { sendRulesToUser, sendPublicRulesEmbed } = require('./handlers/rulesEmbed');
const welcomeImage = require('./handlers/welcomeImage');

// 🧹 Schedulerים כלליים
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
const { setupMemberTracker, inactivityCommand } = require('./handlers/memberTracker');

// 🔊 Voice & Music
const handleMusicControls = require('./handlers/musicControls');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');

// ⚠️ אנטי-ספאם
const { handleSpam } = require('./handlers/antispam');

// 📘 Slash Commands - טעינה מדויקת (data + execute בלבד)
const { data: birthdayCommandsData, execute: birthdayCommandsExecute } = require('./commands/birthdayCommands');
const { data: fifoData, execute: fifoExecute } = require('./commands/fifo');
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');
const { data: inactivityData, execute: inactivityExecute } = require('./commands/inactivity');
const { data: leaderboardData, execute: leaderboardExecute } = require('./commands/leaderboard');
const { data: mvpDisplayData, execute: mvpDisplayExecute, registerMvpCommand } = require('./commands/mvpDisplay');
const { data: refreshRulesData, execute: refreshRulesExecute } = require('./commands/refreshRules');
const { data: rulesStatsData, execute: rulesStatsExecute } = require('./commands/rulesStats');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { data: soundboardData, execute: soundboardExecute } = require('./commands/soundboard');
const { data: ttsCommandData, execute: ttsCommandExecute } = require('./commands/ttsCommand');
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: voiceDeleteData, execute: voiceDeleteExecute } = require('./commands/voiceDelete');
const { data: voiceListData, execute: voiceListExecute } = require('./commands/voiceList');
const { data: voicePlaybackData, execute: voicePlaybackExecute } = require('./commands/voicePlayback');
const { data: voiceRecorderData, execute: voiceRecorderExecute } = require('./commands/voiceRecorder');

// 🧾 בניית רשימת Slash Commands לרישום
const commands = [];
registerMvpCommand(commands);
commands.push(
  rankCommand.data,
  inactivityCommand.data,
  birthdayCommandsData,
  fifoData,
  helpData,
  inactivityData,
  leaderboardData,
  mvpDisplayData,
  refreshRulesData,
  rulesStatsData,
  songData,
  soundboardData,
  ttsCommandData,
  verifyData,
  voiceDeleteData,
  voiceListData,
  voicePlaybackData,
  voiceRecorderData
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
    const existing = await rest.get(Routes.applicationGuildCommands(client.user.id, guildId));
    for (const cmd of existing) {
      await rest.delete(Routes.applicationGuildCommand(client.user.id, guildId, cmd.id));
      console.log(`🗑️ נמחקה פקודה ישנה: /${cmd.name}`);
    }
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    console.log('✅ Slash Commands נרשמו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash:', err);
  }

  // 📦 אתחולים
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  await sendPublicRulesEmbed(client);
  setupInteractions(client);
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
client.on('guildMemberAdd', member => sendRulesToUser(member));
client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('presenceUpdate', (_, now) => trackGamePresence(now));

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
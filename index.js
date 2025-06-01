// 📁 index.js
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const schedule = require('node-schedule');

// 🎮 פיצ'רים Scheduler
const { postOrUpdateWeeklySchedule } = require('./handlers/scheduleUpdater');
const handleRSVP = require('./handlers/scheduleButtonsHandler');
const { data: activityBoardData, execute: activityBoardExecute } = require('./commands/activityBoard');

// 📘 שאר הייבוא שלך — נשאר בדיוק כפי שהיה (לא נערך כאן)
const {
  sendPublicRulesEmbed,
  sendRulesToUser,
  handleRulesInteraction,
  startWeeklyRulesUpdate
} = require('./handlers/rulesEmbed');
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: fifoData, execute: fifoExecute } = require('./commands/fifo');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { data: birthdayCommands, execute: birthdayExecute } = require('./commands/birthdayCommands');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { registerMvpCommand } = require('./commands/mvpDisplay');
const { startMiniGameScheduler } = require('./handlers/miniGames');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const handleMusicControls = require('./handlers/musicControls');
const ttsCommand = require('./commands/ttsCommand');
const smartChat = require('./handlers/smartChat');
const welcomeImage = require('./handlers/welcomeImage');
const { startActivityScheduler } = require('./handlers/activityScheduler');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./handlers/birthdayModal');
const {
  setupVerificationMessage,
  startDmTracking,
  handleInteraction: handleVerifyInteraction
} = require('./handlers/verificationButton');
const {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
} = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { data: leaderboardData, execute: leaderboardExecute } = require('./commands/leaderboard');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { data: refreshRulesData, execute: refreshRulesExecute } = require('./commands/refreshRules');
const { data: rulesStatsData, execute: rulesStatsExecute } = require('./commands/rulesStats');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { handleSpam } = require('./handlers/antispam');
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');

// פקודות Slash — כולל לוח פעילות
const commands = [];
registerMvpCommand(commands);
commands.push(
  verifyData,
  songData,
  soundData,
  ...birthdayCommands,
  leaderboardData,
  fifoData,
  rulesStatsData,
  ttsCommand.data,
  refreshRulesData,
  activityBoardData // לוח פעילות
);

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

// ▶️ התחברות
client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  await sendPublicRulesEmbed(client);
  startWeeklyRulesUpdate(client);
  welcomeImage(client);
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

  // ⏰ תזמון לוח פעילות שבועי — כל מוצ"ש ב־21:00 (שעון שרת)
  schedule.scheduleJob('0 21 * * 6', async () => {
    try {
      await postOrUpdateWeeklySchedule(client);
      console.log('🗓️ לוח פעילות שבועי נשלח אוטומטית');
    } catch (e) {
      console.error('❌ תקלה בלוח פעילות:', e);
    }
  });

  console.log(`שימי הבוט באוויר! ${client.user.tag}`);

  // פקודות Slash
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
  await sendRulesToUser(member);
});

// 💬 טקסט
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await statTracker.trackMessage(message);

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
    // 🟦 כפתורי לוח פעילות
    if (interaction.customId.startsWith('rsvp_')) {
      return handleRSVP(interaction, client);
    }
    // 🟦 שאר כפתורים
    if (['pause', 'resume', 'stop'].includes(interaction.customId)) {
      return handleMusicControls(interaction);
    }
    if (interaction.customId === 'open_birthday_modal') {
      return showBirthdayModal(interaction);
    }
    if (interaction.customId.startsWith('rules_') || interaction.customId === 'accept_rules') {
      return handleRulesInteraction(interaction);
    }
    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayModalSubmit(interaction, client);
  }

  if (!interaction.isCommand()) return;

  await statTracker.trackSlash(interaction);

  const { commandName } = interaction;

  // פקודות Slash
  if (commandName === 'song') return songExecute(interaction, client);
  if (commandName === 'updaterules') return refreshRulesExecute(interaction);
  if (commandName === 'rules') return rulesStatsExecute(interaction);
  if (commandName === 'fifo') return fifoExecute(interaction);
  if (commandName === 'tts') return ttsCommand.execute(interaction);
  if (commandName === 'activity') return activityBoardExecute(interaction, client); // לוח פעילות Slash
  if (commandName === 'leaderboard') return leaderboardExecute(interaction);
  if (commandName === 'soundbaord') return soundExecute(interaction, client);
  if (commandName === 'verify') return verifyExecute(interaction);
  if (commandName === 'mvp') return mvpDisplayExecute(interaction, client);

  if ([
    'addbirthday',
    'birthdays',
    'nextbirthday',
    'missingbirthday'
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

// ✅ תוספת אחת בלבד: הפעלת בוט טלגרם
require('./shimonTelegram');

// ✅ מחזיק את התהליך חי כל הזמן
setInterval(() => {}, 1000 * 60 * 60);

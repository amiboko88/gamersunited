// 📁 index.js — בנוי מלא Production | Node 22 | Discord.js v14 | ישראל 2025

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const schedule = require('node-schedule');

// ====== קומנדס מרכזיים (פקודות-על) ======
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');
const { data: communityData, execute: communityExecute } = require('./commands/community');
const { data: adminData, execute: adminExecute } = require('./commands/admin');

// ====== שאר require/handlers ======
const { postOrUpdateWeeklySchedule } = require('./handlers/scheduleUpdater');
const { startStatsUpdater } = require('./handlers/statsUpdater');
const { sendLeaderboardToTelegram } = require("./handlers/sendLeaderboardToTelegram");
const handleRSVP = require('./handlers/scheduleButtonsHandler');
const { sendPublicRulesEmbed, sendRulesToUser, handleRulesInteraction, startWeeklyRulesUpdate } = require('./handlers/rulesEmbed');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const handleMusicControls = require('./handlers/musicControls');
const smartChat = require('./handlers/smartChat');
const welcomeImage = require('./handlers/welcomeImage');
const { startActivityScheduler } = require('./handlers/activityScheduler');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./handlers/birthdayModal');
const { setupVerificationMessage, startDmTracking, handleInteraction: handleVerifyInteraction } = require('./handlers/verificationButton');
const { trackGamePresence, hardSyncPresenceOnReady, startPresenceLoop } = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { setupMemberTracker } = require('./handlers/memberTracker');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { handleSpam } = require('./handlers/antispam');
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');

// ====== הרשימת Slash Commands ======
const commands = [
  helpData,
  communityData,
  adminData,
];

// ====== client instance ======
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

// ====== once ready — להריץ הכל, כולל סנכרון Slash ======
client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await sendLeaderboardToTelegram(imagePath);
  await setupVerificationMessage(client);
  await sendPublicRulesEmbed(client);
  startStatsUpdater(client);
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
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);

  // תזמון שבועי ללוח פעילות
  schedule.scheduleJob('0 21 * * 6', async () => {
    try {
      await postOrUpdateWeeklySchedule(client);
      console.log('🗓️ לוח פעילות שבועי נשלח אוטומטית');
    } catch (e) {
      console.error('❌ תקלה בלוח פעילות:', e);
    }
  });

  // ====== סנכרון Slash Commands ======
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ פקודות Slash עודכנו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }

  console.log(`הבוט עלה! ${client.user.tag}`);
});

// ====== event handlers (הודעות, קול, נוכחות, הצטרפות וכו') ======
client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});
client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});
client.on('guildMemberAdd', async member => {
  await sendRulesToUser(member);
});
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await statTracker.trackMessage(message);
  await handleSpam(message);
  await smartChat(message);
});

// ====== אינטראקציות (Slash, כפתורים, מודאלים) ======
client.on('interactionCreate', async interaction => {
  // ---- אוטוקומפליטים ----
  if (interaction.isAutocomplete()) return;

  // ---- טיפול ב-help (כפתורים, מודאל) ----
  if (
    (interaction.isButton() && interaction.customId.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }
  // ---- טיפול בלוח פעילות (דוגמה) ----
  if (interaction.isButton() && interaction.customId.startsWith('vote_')) {
    return handleRSVP(interaction, client);
  }
  if (interaction.isButton() && interaction.customId === 'show_stats') {
    return handleRSVP(interaction, client);
  }
  // ---- מוזיקה ----
  if (['pause', 'resume', 'stop'].includes(interaction.customId)) {
    return handleMusicControls(interaction);
  }
  if (interaction.customId === 'open_birthday_modal') {
    return showBirthdayModal(interaction);
  }
  if (interaction.customId.startsWith('rules_') || interaction.customId === 'accept_rules') {
    return handleRulesInteraction(interaction);
  }
  if (interaction.customId.startsWith('verify')) {
    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayModalSubmit(interaction, client);
  }

  // ====== Slash Commands עיקריות בלבד ======
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'עזרה') return helpExecute(interaction);
  if (commandName === 'קהילה') return communityExecute(interaction);
  if (commandName === 'ניהול') return adminExecute(interaction);

  // --- תוכל להוסיף כאן פקודות יחידניות נוספות (פינג, מידע) אם יש ---
});

// ====== הרצת הבוט ======
client.login(process.env.DISCORD_TOKEN);

// ====== ניטור תקלות מערכת ======
process.on('exit', (code) => { console.log(`[EXIT] התהליך הסתיים עם קוד: ${code}`); });
process.on('SIGTERM', () => { console.log('[SIGTERM] SIGTERM!'); });
process.on('uncaughtException', (err) => { console.error('[UNCAUGHT EXCEPTION]', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('[UNHANDLED REJECTION]', reason); });

// ====== בוט טלגרם / משאבים נוספים / אינטרוולים ======
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

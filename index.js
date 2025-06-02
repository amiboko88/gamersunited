require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const schedule = require('node-schedule');

// ====== קומנדס מרכזיים (פקודות-על) ======
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');
const { data: communityData, execute: communityExecute } = require('./commands/community');
const { data: adminData, execute: adminExecute } = require('./commands/admin');

// ====== שאר require/handlers ======
const { postOrUpdateWeeklySchedule } = require('./handlers/scheduleUpdater');
const handleRSVP = require('./handlers/scheduleButtonsHandler');
const { sendPublicRulesEmbed, sendRulesToUser, handleRulesInteraction, startWeeklyRulesUpdate } = require('./handlers/rulesEmbed');
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
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

const commands = [
  helpData,
  communityData,
  adminData,
  soundData,
  verifyData,
];

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

  // סנכרון Slash Commands (GUILD בלבד)
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
    (interaction.isButton() && typeof interaction.customId === 'string' && interaction.customId.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }
  // ---- טיפול בלוח פעילות ----
  if (
    interaction.isButton() &&
    typeof interaction.customId === 'string' &&
    interaction.customId.startsWith('vote_')
  ) {
    return handleRSVP(interaction, client);
  }
  if (interaction.isButton() && interaction.customId === 'show_stats') {
    return handleRSVP(interaction, client);
  }
  // ---- מוזיקה ----
  if (interaction.isButton() && ['pause', 'resume', 'stop'].includes(interaction.customId)) {
    return handleMusicControls(interaction);
  }
  if (interaction.isButton() && interaction.customId === 'open_birthday_modal') {
    return showBirthdayModal(interaction);
  }
  if (
    interaction.isButton() &&
    typeof interaction.customId === 'string' &&
    (interaction.customId.startsWith('rules_') || interaction.customId === 'accept_rules')
  ) {
    return handleRulesInteraction(interaction);
  }
  if (interaction.isButton() && typeof interaction.customId === 'string' && interaction.customId.startsWith('verify')) {
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

client.login(process.env.DISCORD_TOKEN);

// ניטור תקלות מערכת
process.on('exit', (code) => { console.log(`[EXIT] התהליך הסתיים עם קוד: ${code}`); });
process.on('SIGTERM', () => { console.log('[SIGTERM] SIGTERM!'); });
process.on('uncaughtException', (err) => { console.error('[UNCAUGHT EXCEPTION]', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('[UNHANDLED REJECTION]', reason); });

// משאבים נוספים / בוט טלגרם
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

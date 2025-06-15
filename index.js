require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');
const smartChat = require('./handlers/smartChat');
const setupInteractions = require('./handlers/interactionHandler');
const { handleXPMessage } = require('./handlers/engagementManager');
const { sendRulesToUser } = require('./handlers/rulesEmbed');
const { handleSpam } = require('./handlers/antispam');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const { trackGamePresence } = require('./handlers/presenceTracker');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');
const { startStatsUpdater } = require('./handlers/statsUpdater');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { startPresenceRotation, startPresenceLoop, hardSyncPresenceOnReady } = require('./handlers/presenceTracker');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');
const { setupVerificationMessage, startDmTracking } = require('./handlers/verificationButton');
const welcomeImage = require('./handlers/welcomeImage');
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');
const { startWeeklyRulesUpdate, sendPublicRulesEmbed } = require('./handlers/rulesEmbed');
const { setupMemberTracker } = require('./handlers/memberTracker');

// Slash commands imports
const { data: birthdayData } = require('./commands/birthdayCommands');
const { data: fifoData } = require('./commands/fifo');
const { data: helpData } = require('./commands/help');
const { data: inactivityData } = require('./commands/inactivity');
const { data: leaderboardData } = require('./commands/leaderboard');
const { data: mvpDisplayData, registerMvpCommand } = require('./commands/mvpDisplay');
const { data: refreshRulesData } = require('./commands/refreshRules');
const { data: rulesStatsData } = require('./commands/rulesStats');
const { data: songData } = require('./commands/song');
const { data: soundboardData } = require('./commands/soundboard');
const { data: ttsData } = require('./commands/ttsCommand');
const { data: verifyData } = require('./commands/verify');
const { data: voiceDeleteData } = require('./commands/voiceDelete');
const { data: voiceListData } = require('./commands/voiceList');
const { data: voicePlaybackData } = require('./commands/voicePlayback');
const { data: voiceRecorderData } = require('./commands/voiceRecorder');
const { rankCommand } = require('./handlers/engagementManager');
const { inactivityCommand } = require('./handlers/memberTracker');

const commands = [];
registerMvpCommand(commands);
commands.push(
  rankCommand.data,
  inactivityCommand.data,
  birthdayData,
  fifoData,
  helpData,
  inactivityData,
  leaderboardData,
  mvpDisplayData,
  refreshRulesData,
  rulesStatsData,
  songData,
  soundboardData,
  ttsData,
  verifyData,
  voiceDeleteData,
  voiceListData,
  voicePlaybackData,
  voiceRecorderData
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

client.on('guildMemberAdd', member => sendRulesToUser(member));
client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('presenceUpdate', (_, now) => trackGamePresence(now));

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

client.login(process.env.DISCORD_TOKEN);

process.on('exit', code => console.log(`[EXIT] קוד יציאה: ${code}`));
process.on('SIGTERM', () => console.log('[SIGTERM] סיום תהליך'));
process.on('uncaughtException', err => console.error('[UNCAUGHT EXCEPTION]', err));
process.on('unhandledRejection', reason => console.error('[UNHANDLED REJECTION]', reason));
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

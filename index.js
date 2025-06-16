require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

// כל הייבוא הישיר של כל קובץ/פיצ׳ר שאתה צריך
const statTracker = require('./handlers/statTracker');
const smartChat = require('./handlers/smartChat');
const db = require('./utils/firebase');
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
const { setupMemberTracker, inactivityCommand } = require('./handlers/memberTracker');

// Slash Commands ייבוא ישיר
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
const { rankCommand } = require('./handlers/engagementManager');
const { handleMemberButtons } = require('./commands/memberButtons');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./handlers/birthdayModal');
const { handleRulesInteraction, handleRSVP } = require('./utils/repartitionUtils');
const { handleMusicControls } = require('./handlers/musicControls');

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
    // תמיד תשלח מערך שטוח ו־toJSON בלבד
    const allSlashCommands = commands
      .flat(Infinity)
      .filter(cmd => cmd && typeof cmd.toJSON === 'function')
      .map(cmd => cmd.toJSON());
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: allSlashCommands });
    console.log('✅ Slash Commands נרשמו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash:', err);
  }
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

// אינטראקציות
client.on('interactionCreate', async interaction => {
  // 🟢 אוטוקומפליט
  if (interaction.isAutocomplete()) return songAutocomplete(interaction);

  // 🟠 עזרה (כפתורים)
  if (
    (interaction.isButton() && interaction.customId?.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }

  // 🟡 כפתורים (Buttons)
  if (interaction.isButton()) {
    const id = interaction.customId;

    // כפתורי DM, אינאקטיביות
    if (
      id.startsWith('send_dm_again_') ||
      id.startsWith('send_final_dm_') ||
      id === 'send_dm_batch_list' ||
      id === 'send_dm_batch_final_check'
    ) return handleMemberButtons(interaction, client);

    // כפתורי מוזיקה
    if (['pause', 'resume', 'stop', 'skip', 'queue', 'volume_up', 'volume_down'].includes(id))
      return handleMusicControls(interaction);

    // RSVP (הצבעות)
    if (id.startsWith('vote_') || id === 'show_stats') return handleRSVP(interaction, client);

    // כפתורי חוקים
    if (id.startsWith('rules_') || id === 'accept_rules' || id === 'decline_rules')
      return handleRulesInteraction(interaction);

    // כפתור פתיחת מודל יום הולדת
    if (id === 'open_birthday_modal') return showBirthdayModal(interaction);

    // Replay לפי קבוצה
    if (id.startsWith('replay_')) {
      const { registerReplayVote, hasReplayVotes, hasBothTeamsVoted, executeReplayReset } = require('./utils/repartitionUtils');
      const { playTTSInVoiceChannel } = require('./utils/ttsQuickPlay');
      const teamName = id.replace('replay_', '').replace('_', ' ');
      const voteResult = registerReplayVote(teamName, interaction.user.id);
      if (!voteResult) {
        return interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });
      }
      await interaction.reply({ content: '💬 ההצבעה שלך נרשמה.', ephemeral: true });

      const opponentGroup = [...voteResult.allGroups.entries()].find(([name]) => name !== teamName);
      if (opponentGroup) {
        const [_, opponentData] = opponentGroup;
        const voiceChannel = interaction.guild.channels.cache.get(opponentData.channelId);
        if (voiceChannel) {
          await playTTSInVoiceChannel(
            voiceChannel,
            `שחקני ${teamName} רוצים ריפליי. מה דעתכם ${opponentData.name}?`
          );
        }
      }
      if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
        await executeReplayReset(interaction.guild, interaction.channel, teamName);
      }
      return;
    }

    // חלוקה מחדש (פיפו)
    if (id === 'repartition_now') {
      const { createGroupsAndChannels, startGroupTracking, resetReplayVotes } = require('./utils/repartitionUtils');
      const { EmbedBuilder } = require('discord.js');
      const FIFO_CHANNEL_ID = '123456789012345678'; // עדכן לערוץ הנכון
      const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID;
      const DEFAULT_GROUP_SIZE = 3;

      const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
      if (!voiceChannel?.isVoiceBased()) return;

      const members = voiceChannel.members.filter(m => !m.user.bot);
      if (members.size < 2) {
        return interaction.reply({ content: '⛔ אין מספיק שחקנים.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize: DEFAULT_GROUP_SIZE,
        categoryId: FIFO_CATEGORY_ID,
        openChannels: true
      });

      const embed = new EmbedBuilder()
        .setTitle('📢 בוצעה חלוקה מחדש!')
        .setColor(0x00ff88)
        .setTimestamp();

      groups.forEach((group, i) => {
        embed.addFields({
          name: `TEAM ${String.fromCharCode(65 + i)}`,
          value: group.map(m => m.displayName).join(', '),
          inline: false
        });

        const ch = channels[i];
        if (ch) startGroupTracking(ch, group.map(m => m.id), `TEAM ${String.fromCharCode(65 + i)}`);
      });

      if (waiting.length > 0) {
        embed.addFields({
          name: '⏳ ממתינים',
          value: waiting.map(m => m.displayName).join(', '),
          inline: false
        });
      }

      await interaction.editReply({ content: '✅ בוצעה חלוקה מחדש', embeds: [embed] });
      resetReplayVotes();
      return;
    }

    // כאן תוכל להוסיף עוד כפתורים עתידיים
  }

  // 🟢 מודלים (Modal)
  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayModalSubmit(interaction, client);
  }

  // 🔵 פקודות Slash — ישן וטיפש, בטוח!
  if (interaction.isCommand()) {
    if (interaction.commandName === 'עזרה')                 return helpExecute(interaction, client);
    if (interaction.commandName === 'inactivity')           return inactivityExecute(interaction, client);
    if (interaction.commandName === 'updaterules')          return refreshRulesExecute(interaction, client);
    if (interaction.commandName === 'rulestats')            return rulesStatsExecute(interaction, client);
    if (interaction.commandName === 'tts')                  return ttsCommandExecute(interaction, client);
    if (interaction.commandName === 'leaderboard')          return leaderboardExecute(interaction, client);
    if (interaction.commandName === 'הקלט')                 return voiceRecorderExecute(interaction, client);
    if (interaction.commandName === 'השמע_אחרון')           return voicePlaybackExecute(interaction, client);
    if (interaction.commandName === 'רשימת_הקלטות')        return voiceListExecute(interaction, client);
    if (interaction.commandName === 'מחק_הקלטות')          return voiceDeleteExecute(interaction, client);
    if (interaction.commandName === 'רמה_שלי')              return rankCommand.execute(interaction, client);
    if (interaction.commandName === 'סאונדבורד')           return soundboardExecute(interaction, client);
    if (interaction.commandName === 'אימות')                return verifyExecute(interaction, client);
    if (interaction.commandName === 'מוזיקה')               return songExecute(interaction, client);
    if (interaction.commandName === 'פיפו')                 return fifoExecute(interaction, client);
    if (interaction.commandName === 'מצטיין_שבוע')         return mvpDisplayExecute(interaction, client);
    if (interaction.commandName === 'הוסף_יום_הולדת')      return birthdayCommandsExecute(interaction, client);
    if (interaction.commandName === 'ימי_הולדת')           return birthdayCommandsExecute(interaction, client);
    if (interaction.commandName === 'היום_הולדת_הבא')      return birthdayCommandsExecute(interaction, client);
    if (interaction.commandName === 'ימי_הולדת_חסרים')     return birthdayCommandsExecute(interaction, client);
    // תוסיף כאן פקודות עתידיות כמו פעם!
  }
});



// 🧪 ניטור שגיאות מערכת
process.on('exit', code => console.log(`[EXIT] קוד יציאה: ${code}`));
process.on('SIGTERM', () => console.log('[SIGTERM] סיום תהליך'));
process.on('uncaughtException', err => console.error('[UNCAUGHT EXCEPTION]', err));
process.on('unhandledRejection', reason => console.error('[UNHANDLED REJECTION]', reason));
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

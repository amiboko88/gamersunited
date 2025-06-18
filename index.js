require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');

// 🔗 בסיס נתונים ועזרי מערכת
const db = require('./utils/firebase');
const { playTTSInVoiceChannel } = require('./utils/ttsQuickPlay');
const { executeReplayReset } = require('./utils/repartitionUtils');
const { createGroupsAndChannels } = require('./utils/squadBuilder');

// 🧠 ניתוח / סטטיסטיקות / XP
const statTracker = require('./handlers/statTracker');
const { handleXPMessage, rankCommand } = require('./handlers/engagementManager');
const { startStatsUpdater } = require('./handlers/statsUpdater');

// 🏆 MVP ו־Reactions
const { data: mvpData, execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 📊 לוחות ומעקב
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');
const { data: leaderboardData, execute: leaderboardExecute } = require('./commands/leaderboard');

// 🧑‍🤝‍🧑 Replay ופיפו
const { startGroupTracking } = require('./handlers/groupTracker');
const {
  registerReplayVote,
  resetReplayVotes,
  hasReplayVotes,
  hasBothTeamsVoted,
  activeGroups
} = require('./utils/replayManager');

// 👥 אימות, אנטי-ספאם ודיבור חכם
const { setupVerificationMessage, startDmTracking, handleInteraction: handleVerifyInteraction } = require('./handlers/verificationButton');
const { handleSpam } = require('./handlers/antispam');
const smartChat = require('./handlers/smartChat');

// 📜 חוקים והודעות
const {
  sendPublicRulesEmbed,
  sendRulesToUser,
  handleRulesInteraction,
  startWeeklyRulesUpdate
} = require('./handlers/rulesEmbed');

// 👤 נוכחות וזיהוי
const { trackGamePresence, hardSyncPresenceOnReady, startPresenceLoop } = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const welcomeImage = require('./handlers/welcomeImage');

// 🧹 תחזוקה תקופתית
const { startCleanupScheduler } = require('./handlers/channelCleaner');

// 🪅 מערכת ימי הולדת (חדשה!)
const birthdayPanel = require('./commands/birthdayPanel');
const handleBirthdayPanel = require('./handlers/birthdayPanelHandler');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');

// 🧠 עזרה / עיצוב / כפתורים
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');
const { handleMemberButtons } = require('./commands/memberButtons');

// 🔊 הקלטות / סאונדבורד / מוזיקה
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const handleMusicControls = require('./handlers/musicControls');
const { data: soundData, execute: soundExecute } = require('./commands/soundboard');
const { data: recordData, execute: recordExecute } = require('./commands/voiceRecorder');
const { data: playbackData, execute: playbackExecute } = require('./commands/voicePlayback');
const { data: listData, execute: listExecute } = require('./commands/voiceList');
const { data: deleteData, execute: deleteExecute } = require('./commands/voiceDelete');
const ttsCommand = require('./commands/ttsCommand');

// 📌 פיפו + ניהול מערכת
const { data: fifoData, execute: fifoExecute } = require('./commands/fifo');
const inactivityCommand = require('./commands/inactivity');
const fixInactivityCommand = require('./commands/fixInactivity');

// 🛡️ אימות / סטטיסטיקות חוקים
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: refreshRulesData, execute: refreshRulesExecute } = require('./commands/refreshRules');
const { data: rulesStatsData, execute: rulesStatsExecute } = require('./commands/rulesStats');

// 📡 טלגרם
require('./shimonTelegram');


const commands = [];
commands.push(
  rankCommand.data,
  inactivityCommand.data,
  fixInactivityCommand.data,
  mvpData,
  fifoData,
  birthdayPanel.data, 
  helpData,
  leaderboardData,
  ttsCommand.data,
  refreshRulesData,
  rulesStatsData,
  verifyData,
  recordData,
  playbackData,
  listData,
  deleteData,
  songData,
  soundData
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
  startBirthdayTracker(client);
  startWeeklyBirthdayReminder(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);
  await startMvpReactionWatcher(client, db);

  console.log(` הבוט באוויר! ${client.user.tag}`);

  // פקודות Slash
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;
  try {
    const allSlashCommands = commands
      .flat(Infinity)
      .filter(cmd => cmd && typeof cmd.toJSON === 'function')
      .map(cmd => cmd.toJSON());
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: allSlashCommands }
    );
    console.log('✅ פקודות Slash עודכנו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }
});

// --- EVENTS ---
client.on('guildMemberAdd', async member => {
  await sendRulesToUser(member);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await statTracker.trackMessage(message);
  await handleXPMessage(message);

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

// -------- אינטראקציות ---------
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) return songAutocomplete(interaction);

  // 🆘 כפתורי עזרה
  if (
    (interaction.isButton() && interaction.customId && interaction.customId.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }

  // 🔘 כפתורים רגילים
  if (interaction.isButton()) {
    const id = interaction.customId;

    // 👥 כפתורי ניהול DM/inactivity
    const isMemberButton = [
      'send_dm_batch_list',
      'send_dm_batch_final_check',
      'show_failed_list',
      'show_replied_list',
      'kick_failed_users'
    ].includes(id) || id.startsWith('send_dm_again_') || id.startsWith('send_final_dm_');

    if (isMemberButton) {
      return handleMemberButtons(interaction, client);
    }

    // 🎶 כפתורי מוזיקה
    if (['pause', 'resume', 'stop'].includes(id)) {
      return handleMusicControls(interaction);
    }

    // 📜 כפתורי חוקים
    if (id.startsWith('rules_') || id === 'accept_rules') {
      return handleRulesInteraction(interaction);
    }

    // 🎂 כפתורי פאנל יום הולדת
    if (
      [
        'bday_list',
        'bday_next',
        'bday_add',
        'bday_missing',
        'bday_remind_missing'
      ].includes(id)
    ) {
      return handleBirthdayPanel(interaction);
    }

    // 🗳️ RSVP כפתורים
    if (id.startsWith('vote_') || id === 'show_stats') {
      return handleRSVP(interaction, client);
    }

    // 🎮 replay system
    if (id.startsWith('replay_')) {
      const teamName = id.replace('replay_', '').replace('_', ' ');
      const voteResult = registerReplayVote(teamName, interaction.user.id);

      if (!voteResult) {
        return await interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });
      }

      await interaction.reply({ content: '💬 ההצבעה שלך נרשמה.', ephemeral: true });

      if (voteResult.allVoted) {
        const opponentGroup = [...activeGroups.entries()].find(([name]) => name !== teamName);
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
      }

      if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
        await executeReplayReset(interaction.guild, interaction.channel, teamName);
      }
      return;
    }

    // 🌀 חלוקה לפיפו
    if (id === 'repartition_now') {
      const FIFO_CHANNEL_ID = '123456789012345678'; // עדכן לפי הצורך
      const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID;
      const DEFAULT_GROUP_SIZE = 3;

      const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
      if (!voiceChannel?.isVoiceBased()) return;

      const members = voiceChannel.members.filter(m => !m.user.bot);
      if (members.size < 2) {
        return await interaction.reply({ content: '⛔ אין מספיק שחקנים.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize: DEFAULT_GROUP_SIZE,
        categoryId: FIFO_CATEGORY_ID,
        openChannels: true
      });

      const summaryEmbed = new EmbedBuilder()
        .setTitle('📢 בוצעה חלוקה מחדש!')
        .setColor(0x00ff88)
        .setTimestamp();

      groups.forEach((group, i) => {
        const name = `TEAM ${String.fromCharCode(65 + i)}`;
        summaryEmbed.addFields({
          name,
          value: group.map(m => m.displayName).join(', '),
          inline: false
        });

        const ch = channels[i];
        if (ch) startGroupTracking(ch, group.map(m => m.id), name);
      });

      if (waiting.length > 0) {
        summaryEmbed.addFields({
          name: '⏳ ממתינים',
          value: waiting.map(m => m.displayName).join(', '),
          inline: false
        });
      }

      await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה!', embeds: [summaryEmbed] });
      resetReplayVotes();
      return;
    }

    // ✅ אימות משתמשים
    return handleVerifyInteraction(interaction);
  }

  // 📬 קלט ממודל של יום הולדת
  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayPanel(interaction);
  }

  if (!interaction.isCommand()) return;
  await statTracker.trackSlash(interaction);

  const { commandName } = interaction;

  // פקודת עזרה
  if (commandName === 'עזרה') return helpExecute(interaction);

  // פקודות אדמין
  if (commandName === 'inactivity') return inactivityCommand.execute(interaction);
  if (commandName === 'updaterules') return refreshRulesExecute(interaction);
  if (commandName === 'rulestats') return rulesStatsExecute(interaction);
  if (commandName === 'tts') return ttsCommand.execute(interaction);
  if (commandName === 'leaderboard') return leaderboardExecute(interaction);
  if (commandName === 'הקלט') return recordExecute(interaction);
  if (commandName === 'השמע_אחרון') return playbackExecute(interaction);
  if (commandName === 'רשימת_הקלטות') return listExecute(interaction);
  if (commandName === 'מחק_הקלטות') return deleteExecute(interaction);
  if (commandName === 'fix_inactivity') return fixInactivityCommand.execute(interaction);

  // פקודות ציבוריות
  if (commandName === 'רמה_שלי') return rankCommand.execute(interaction);
  if (commandName === 'סאונדבורד') return soundExecute(interaction, client);
  if (commandName === 'אימות') return verifyExecute(interaction);
  if (commandName === 'מוזיקה') return songExecute(interaction, client);
  if (commandName === 'פיפו') return fifoExecute(interaction);
  if (commandName === 'מצטיין') return mvpDisplayExecute(interaction, client);
  if (commandName === 'ימי_הולדת') return birthdayPanel.execute(interaction); // 🎂 פאנל החדש בלבד
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

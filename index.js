require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const schedule = require('node-schedule');
const { executeReplayReset } = require('./utils/repartitionUtils');
const { createGroupsAndChannels } = require('./utils/squadBuilder');
const { startGroupTracking } = require('./handlers/groupTracker');
const { registerReplayVote, resetReplayVotes, hasReplayVotes, hasBothTeamsVoted } = require('./utils/replayManager');
const { playTTSInVoiceChannel } = require('./utils/ttsQuickPlay');
const { activeGroups } = require('./utils/replayManager');
const { EmbedBuilder } = require('discord.js');

// 🎮 Scheduler Features
const { startStatsUpdater } = require('./handlers/statsUpdater');
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');


// ✅ עזרה חדשה עם כפתורים
const { data: helpData, execute: helpExecute, handleButton: helpHandleButton } = require('./commands/help');

// 📈 מערכת ניטור פעילות + רמות
const {
  setupMemberTracker,
  inactivityCommand
} = require('./handlers/memberTracker');

const { handleXPMessage, rankCommand } = require('./handlers/engagementManager');


// 📘 שאר הייבוא שלך (נשאר בדיוק כפי שהוא)
const {
  sendPublicRulesEmbed,
  sendRulesToUser,
  handleRulesInteraction,
  startWeeklyRulesUpdate
} = require('./handlers/rulesEmbed');
const { data: verifyData, execute: verifyExecute } = require('./commands/verify');
const { data: recordData, execute: recordExecute } = require('./commands/voiceRecorder');
const { data: playbackData, execute: playbackExecute } = require('./commands/voicePlayback');
const { data: listData, execute: listExecute } = require('./commands/voiceList');
const { data: deleteData, execute: deleteExecute } = require('./commands/voiceDelete');
const { data: fifoData, execute: fifoExecute } = require('./commands/fifo');
const { data: songData, execute: songExecute, autocomplete: songAutocomplete } = require('./commands/song');
const { execute: soundExecute, data: soundData } = require('./handlers/soundboard');
const { data: birthdayCommands, execute: birthdayExecute } = require('./commands/birthdayCommands');
const { execute: mvpDisplayExecute } = require('./commands/mvpDisplay');
const { registerMvpCommand } = require('./commands/mvpDisplay');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const handleMusicControls = require('./handlers/musicControls');
const ttsCommand = require('./commands/ttsCommand');
const smartChat = require('./handlers/smartChat');
const welcomeImage = require('./handlers/welcomeImage');
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
const { data: refreshRulesData, execute: refreshRulesExecute } = require('./commands/refreshRules');
const { data: rulesStatsData, execute: rulesStatsExecute } = require('./commands/rulesStats');
const { startCleanupScheduler } = require('./handlers/channelCleaner');
const { handleSpam } = require('./handlers/antispam');
const db = require('./utils/firebase');
const statTracker = require('./handlers/statTracker');

// פקודות Slash — כולל כל מה שהיה (כולל MVP)
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
  refreshRulesData,
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
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );
    console.log('✅ פקודות Slash עודכנו בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה ברישום Slash Commands:', err);
  }
});


client.on('guildMemberAdd', async member => {
  await sendRulesToUser(member);
 
});


client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
  
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
  
});




// 💬 טקסט
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await statTracker.trackMessage(message);
  await handleXPMessage(message); // 🧮 מעניק XP

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

  // ✅ עזרה אינטראקטיבית (Button, Modal)
  if (
    (interaction.isButton() && interaction.customId && interaction.customId.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }

  // כפתורי לוח פעילות
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('vote_')) {
      return handleRSVP(interaction, client);
    }

    if (interaction.customId === 'show_stats') {
      return handleRSVP(interaction, client);
    }

    // כפתורי מוסיקה
    if (['pause', 'resume', 'stop'].includes(interaction.customId)) {
      return handleMusicControls(interaction);
    }

    // כפתור יום הולדת
    if (interaction.customId === 'open_birthday_modal') {
      return showBirthdayModal(interaction);
    }

    // כפתורי חוקים
    if (interaction.customId.startsWith('rules_') || interaction.customId === 'accept_rules') {
      return handleRulesInteraction(interaction);
    }

    // 🔘 כפתור שליחה חוזרת - DM ראשוני או ראשון חוזר
    if (interaction.customId.startsWith('send_dm_again_')) {
      const userId = interaction.customId.replace('send_dm_again_', '');
      try {
        const user = await interaction.client.users.fetch(userId);
        const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת חביבה עבור משתמש שטרם היה פעיל.`;
        const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
        await user.send(dm);
        await db.collection('memberTracking').doc(userId).set({
          dmSent: true,
          dmSentAt: new Date().toISOString(),
          reminderCount: 1
        }, { merge: true });
        await interaction.reply({ content: `✅ נשלחה תזכורת ל־<@${userId}>`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `❌ לא ניתן לשלוח ל־<@${userId}>: ${err.message}`, ephemeral: true });
      }
      return;
    }

    // 🔴 כפתור שליחה חוזרת - תזכורת אחרונה למתעלמים
    if (interaction.customId.startsWith('send_final_dm_')) {
      const userId = interaction.customId.replace('send_final_dm_', '');
      try {
        const user = await interaction.client.users.fetch(userId);
        const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת אחרונה ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
        const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
        await user.send(dm);
        await db.collection('memberTracking').doc(userId).set({
          reminderCount: 3,
          dmSentAt: new Date().toISOString()
        }, { merge: true });
        await interaction.reply({ content: `📨 נשלחה תזכורת סופית ל־<@${userId}>`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `❌ שגיאה בשליחה ל־<@${userId}>: ${err.message}`, ephemeral: true });
      }
      return;
    }

    // 🔄 Replay לפי קבוצה
    if (interaction.customId.startsWith('replay_')) {
      const teamName = interaction.customId.replace('replay_', '').replace('_', ' ');
      const voteResult = registerReplayVote(teamName, interaction.user.id);

      if (!voteResult) {
        return await interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });
      }

      await interaction.reply({ content: '💬 ההצבעה שלך נרשמה.', ephemeral: true });

      // ✅ אם כולם בקבוצה הזו הצביעו – השמע לקבוצה השנייה
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

      // ✅ אם גם הקבוצה השנייה הצביעה — איפוס מלא
      if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
        await executeReplayReset(interaction.guild, interaction.channel, teamName);
      }

      return;
    }

    // 🚀 חלקו מחדש
    if (interaction.customId === 'repartition_now') {
      const FIFO_CHANNEL_ID = '123456789012345678'; // 🛑 עדכן ל־ID של הערוץ הראשי
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

    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayModalSubmit(interaction, client);
  }

  if (!interaction.isCommand()) return;

  await statTracker.trackSlash(interaction);

  const { commandName } = interaction;

  // עזרה (פקודת Slash עזרה)
  if (commandName === 'עזרה') return helpExecute(interaction);

  // Slash מנהלים
  if (commandName === 'inactivity') return inactivityCommand.execute(interaction);
  if (commandName === 'updaterules') return refreshRulesExecute(interaction);
  if (commandName === 'rulestats') return rulesStatsExecute(interaction);
  if (commandName === 'tts') return ttsCommand.execute(interaction);
  if (commandName === 'leaderboard') return leaderboardExecute(interaction);
  if (commandName === 'הקלט') return recordExecute(interaction);
  if (commandName === 'השמע_אחרון') return playbackExecute(interaction);
  if (commandName === 'רשימת_הקלטות') return listExecute(interaction);
  if (commandName === 'מחק_הקלטות') return deleteExecute(interaction);

  // Slash משתמשים
  if (commandName === 'רמה_שלי') return rankCommand.execute(interaction);
  if (commandName === 'סאונדבורד') return soundExecute(interaction, client);
  if (commandName === 'אימות') return verifyExecute(interaction);
  if (commandName === 'מוזיקה') return songExecute(interaction, client);
  if (commandName === 'פיפו') return fifoExecute(interaction);
  if (commandName === 'מצטיין_שבוע') return mvpDisplayExecute(interaction, client);
  if (
    ['הוסף_יום_הולדת', 'ימי_הולדת', 'היום_הולדת_הבא', 'ימי_הולדת_חסרים']
      .includes(commandName)
  ) {
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

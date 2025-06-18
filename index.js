// 📁 index.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

// 🔗 בסיס נתונים ועזרי מערכת
const { registerSlashCommands } = require('./utils/commandsLoader');
const db = require('./utils/firebase');
const { playTTSInVoiceChannel } = require('./utils/ttsQuickPlay');
const { executeReplayReset } = require('./utils/repartitionUtils');
const { createGroupsAndChannels } = require('./utils/squadBuilder');

// 🧠 ניתוח / סטטיסטיקות / XP
const statTracker = require('./handlers/statTracker');
const { handleXPMessage } = require('./handlers/engagementManager');
const { startStatsUpdater } = require('./handlers/statsUpdater');

// 🏆 MVP ו־Reactions
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 📊 לוחות ומעקב
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');

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
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');
const { setupVerificationMessage, startDmTracking, handleInteraction: handleVerifyInteraction } = require('./handlers/verificationButton');
const { handleSpam } = require('./handlers/antispam');
const smartChat = require('./handlers/smartChat');

// 👤 נוכחות וזיהוי
const { trackGamePresence, hardSyncPresenceOnReady, startPresenceLoop } = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const welcomeImage = require('./handlers/welcomeImage');

// 🧹 תחזוקה תקופתית
const { startCleanupScheduler } = require('./handlers/channelCleaner');

// 🪅 מערכת ימי הולדת
const handleBirthdayPanel = require('./handlers/birthdayPanelHandler');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');

// 🧠 עזרה / כפתורים
const { handleButton: helpHandleButton } = require('./commands/help');
const { handleMemberButtons } = require('./commands/memberButtons');

// 🔊 מוזיקה וסאונד
const { autocomplete: songAutocomplete } = require('./commands/song');
const handleMusicControls = require('./handlers/musicControls');

// 🛡️ אימות
const { startInactivityReminder } = require('./handlers/inactivityReminder');

// 📡 טלגרם
require('./shimonTelegram');

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

// 🧠 טעינת Slash Commands (Map)
const commandMap = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command?.data?.name && typeof command.execute === 'function') {
    commandMap.set(command.data.name, command);
  }
}

client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  await registerSlashCommands(client.user.id, client); // רישום Slash מול Discord
  await startMvpReactionWatcher(client, db);

  startFifoWarzoneAnnouncer(client);
  startStatsUpdater(client);
  welcomeImage(client);
  startInactivityReminder(client);
  startDmTracking(client);
  startLeaderboardUpdater(client);
  startPresenceLoop(client);
  startPresenceRotation(client);
  startBirthdayTracker(client);
  startWeeklyBirthdayReminder(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);

  console.log(` הבוט באוויר! ${client.user.tag}`);
});

// --- EVENTS ---
client.on('guildMemberAdd', async member => { });

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

    const isMemberButton = [
      'send_dm_batch_list',
      'send_dm_batch_final_check',
      'show_failed_list',
      'show_replied_list',
      'kick_failed_users'
    ].includes(id) || id.startsWith('send_dm_again_') || id.startsWith('send_final_dm_');
    if (isMemberButton) return handleMemberButtons(interaction, client);

    if (['pause', 'resume', 'stop'].includes(id)) {
      return handleMusicControls(interaction);
    }

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

    if (id.startsWith('vote_') || id === 'show_stats') {
      return handleRSVP(interaction, client);
    }

    if (id.startsWith('replay_')) {
      const teamName = id.replace('replay_', '').replace('_', ' ');
      const voteResult = registerReplayVote(teamName, interaction.user.id);

      if (!voteResult) return interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });

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

    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayPanel(interaction);
  }

  if (!interaction.isCommand()) return;
  await statTracker.trackSlash(interaction);

  // 🧠 הפעלת פקודות Slash
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`❌ שגיאה בביצוע Slash "${interaction.commandName}":`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ שגיאה בביצוע הפקודה.', ephemeral: true });
    }
  }
});

// 🚀 הפעלת הבוט
client.login(process.env.DISCORD_TOKEN);
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);

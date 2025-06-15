// 📁 handlers/interactionHandler.js
const { EmbedBuilder } = require('discord.js');
const statTracker = require('../handlers/statTracker');
const {
  handleRulesInteraction,
  handleBirthdayModalSubmit,
  handleRSVP,
  registerReplayVote,
  hasReplayVotes,
  hasBothTeamsVoted,
  executeReplayReset,
  startGroupTracking,
  resetReplayVotes,
  createGroupsAndChannels
} = require('../handlers/repartitionUtils');
const { songAutocomplete, handleMusicControls } = require('../commands/song');
const { showBirthdayModal } = require('../commands/birthdayCommands');
const {
  helpExecute,
  helpHandleButton
} = require('../commands/help');
const verifyExecute = require('../commands/verify').execute;
const fifoExecute = require('../commands/fifo').execute;
const ttsCommand = require('../commands/ttsCommand');
const leaderboardExecute = require('../commands/leaderboard').execute;
const mvpDisplayExecute = require('../commands/mvpDisplay').execute;
const refreshRulesExecute = require('../commands/refreshRules').execute;
const rulesStatsExecute = require('../commands/rulesStats').execute;
const recordExecute = require('../commands/voiceRecorder').execute;
const playbackExecute = require('../commands/voicePlayback').execute;
const listExecute = require('../commands/voiceList').execute;
const deleteExecute = require('../commands/voiceDelete').execute;
const rankCommand = require('../commands/rank');
const soundExecute = require('../commands/soundboard').execute;
const birthdayExecute = require('../commands/birthdayCommands').execute;
const smartChat = require('../handlers/smartChat');
const db = require('../utils/firebase');

// ⚠️ שמור גם את מה שעשינו ב־memberButtons
const {
  handleCustomDMButtons
} = require('../commands/memberButtons');

module.exports = function setupInteractions(client) {
  client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) return songAutocomplete(interaction);

    // 🧠 עזרה
    if (
      (interaction.isButton() && interaction.customId?.startsWith('help_')) ||
      (interaction.type === 5 && interaction.customId === 'help_ai_modal')
    ) {
      if (await helpHandleButton(interaction)) return;
    }

    // 🎮 אינטראקציות שונות לפי customId
    if (interaction.isButton()) {
      const id = interaction.customId;

      // ניהול DM
      if (id.startsWith('send_dm_')) return handleCustomDMButtons(interaction);

      // מוסיקה
      if (['pause', 'resume', 'stop'].includes(id)) {
        return handleMusicControls(interaction);
      }

      // RSVP
      if (id.startsWith('vote_') || id === 'show_stats') {
        return handleRSVP(interaction, client);
      }

      if (id === 'open_birthday_modal') return showBirthdayModal(interaction);
      if (id.startsWith('rules_') || id === 'accept_rules') return handleRulesInteraction(interaction);

      if (id.startsWith('replay_')) {
        const teamName = id.replace('replay_', '').replace('_', ' ');
        const voteResult = registerReplayVote(teamName, interaction.user.id);
        if (!voteResult) {
          return interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });
        }
        await interaction.reply({ content: '💬 ההצבעה שלך נרשמה.', ephemeral: true });

        if (voteResult.allVoted) {
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
        }

        if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
          await executeReplayReset(interaction.guild, interaction.channel, teamName);
        }

        return;
      }

      if (id === 'repartition_now') {
        const FIFO_CHANNEL_ID = '123456789012345678'; // עדכן
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

      return;
    }

    // 🎂 מודלים
    if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
      return handleBirthdayModalSubmit(interaction, client);
    }

    // 🛠️ פקודות
    if (!interaction.isCommand()) return;

    await statTracker.trackSlash(interaction);
    const { commandName } = interaction;

    const commandMap = {
      עזרה: helpExecute,
      inactivity: require('../commands/inactivity').execute,
      updaterules: refreshRulesExecute,
      rulestats: rulesStatsExecute,
      tts: ttsCommand.execute,
      leaderboard: leaderboardExecute,
      הקלט: recordExecute,
      השמע_אחרון: playbackExecute,
      רשימת_הקלטות: listExecute,
      מחק_הקלטות: deleteExecute,
      רמה_שלי: rankCommand.execute,
      סאונדבורד: soundExecute,
      אימות: verifyExecute,
      מוזיקה: songExecute,
      פיפו: fifoExecute,
      מצטיין_שבוע: mvpDisplayExecute,
      הוסף_יום_הולדת: birthdayExecute,
      ימי_הולדת: birthdayExecute,
      היום_הולדת_הבא: birthdayExecute,
      ימי_הולדת_חסרים: birthdayExecute
    };

    const cmd = commandMap[commandName];
    if (cmd) return cmd(interaction, client);
  });
};
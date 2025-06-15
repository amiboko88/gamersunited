const { songAutocomplete } = require('../commands/song');
const { handleMemberButtons } = require('./memberButtons');
const { showBirthdayModal, handleBirthdayModalSubmit } = require('./birthdayModal');
const { handleRulesInteraction, handleRSVP } = require('../utils/repartitionUtils');
const { handleMusicControls } = require('./musicControls');
const statTracker = require('./statTracker');
const { rankCommand } = require('./engagementManager');

// Slash commands: ייבוא execute בלבד
const help = require('../commands/help');
const ttsCommand = require('../commands/ttsCommand');
const leaderboard = require('../commands/leaderboard');
const inactivity = require('../commands/inactivity');
const verify = require('../commands/verify');
const song = require('../commands/song');
const fifo = require('../commands/fifo');
const birthday = require('../commands/birthdayCommands');
const refreshRules = require('../commands/refreshRules');
const rulesStats = require('../commands/rulesStats');
const mvpDisplay = require('../commands/mvpDisplay');
const voiceRecorder = require('../commands/voiceRecorder');
const voicePlayback = require('../commands/voicePlayback');
const voiceList = require('../commands/voiceList');
const voiceDelete = require('../commands/voiceDelete');
const soundboard = require('../commands/soundboard');

module.exports = function setupInteractions(client) {
  client.on('interactionCreate', async interaction => {
    // Autocomplete
    if (interaction.isAutocomplete()) return songAutocomplete(interaction);

    // עזרה - לחצנים
    if (
      (interaction.isButton() && interaction.customId?.startsWith('help_')) ||
      (interaction.type === 5 && interaction.customId === 'help_ai_modal')
    ) {
      if (await help.handleButton(interaction)) return;
    }

    // כפתורים: ניהול DM, מוזיקה, RSVP, חוקים, יום הולדת, replay, חלוקה מחדש
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (
        id.startsWith('send_dm_') ||
        id === 'send_dm_batch_list' ||
        id === 'send_dm_batch_final_check'
      ) return handleMemberButtons(interaction, client);

      if (['pause', 'resume', 'stop'].includes(id)) return handleMusicControls(interaction);

      if (id.startsWith('vote_') || id === 'show_stats') return handleRSVP(interaction, client);

      if (id.startsWith('rules_') || id === 'accept_rules') return handleRulesInteraction(interaction);

      if (id === 'open_birthday_modal') return showBirthdayModal(interaction);

      // שאר הכפתורים לפי הצורך...
    }

    // מודל יום הולדת
    if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
      return handleBirthdayModalSubmit(interaction, client);
    }

    // Slash Commands
    if (!interaction.isCommand()) return;
    await statTracker.trackSlash(interaction);
    const { commandName } = interaction;

    const commandMap = {
      עזרה: help.execute,
      inactivity: inactivity.execute,
      updaterules: refreshRules.execute,
      rulestats: rulesStats.execute,
      tts: ttsCommand.execute,
      leaderboard: leaderboard.execute,
      הקלט: voiceRecorder.execute,
      השמע_אחרון: voicePlayback.execute,
      רשימת_הקלטות: voiceList.execute,
      מחק_הקלטות: voiceDelete.execute,
      רמה_שלי: rankCommand.execute,
      סאונדבורד: soundboard.execute,
      אימות: verify.execute,
      מוזיקה: song.execute,
      פיפו: fifo.execute,
      מצטיין_שבוע: mvpDisplay.execute,
      הוסף_יום_הולדת: birthday.execute,
      ימי_הולדת: birthday.execute,
      היום_הולדת_הבא: birthday.execute,
      ימי_הולדת_חסרים: birthday.execute
    };

    const cmd = commandMap[commandName];
    if (cmd) return cmd(interaction, client);
  });
};

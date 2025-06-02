const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ניהול')
    .setDescription('כלי ניהול למנהלים בלבד ⚙️')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(cmd =>
      cmd.setName('tts').setDescription('שימוש בשמעון 🗣️')
    )
    .addSubcommand(cmd =>
      cmd.setName('activity').setDescription('לוח פעילות שבועי 🗓️')
    )
    .addSubcommand(cmd =>
      cmd.setName('leaderboard').setDescription('לוח תוצאות 🏆')
    )
    .addSubcommand(cmd =>
      cmd.setName('updaterules').setDescription('עדכן חוקים 🔧')
    )
    .addSubcommand(cmd =>
      cmd.setName('rulesstats').setDescription('סטטיסטיקות חוקים 📑')
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    switch(sub) {
      case 'tts':
        return require('./ttsCommand').execute(interaction);
      case 'activity':
        return require('./activityBoard').execute(interaction, interaction.client);
      case 'leaderboard':
        return require('./leaderboard').execute(interaction);
      case 'updaterules':
        return require('./refreshRules').execute(interaction);
      case 'rulesstats':
        return require('./rulesStats').execute(interaction);
      default:
        return interaction.reply({ content: 'פקודת ניהול לא מוכרת.', ephemeral: true });
    }
  }
};

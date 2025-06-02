const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ניהול')
    .setDescription('כלי ניהול למנהלים בלבד ⚙️')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(cmd =>
      cmd.setName('שמעון').setDescription('שימוש בשמעון TTS 🗣️')
    )
    .addSubcommand(cmd =>
      cmd.setName('לוח_פעילות').setDescription('ניהול לוח פעילות שבועי 🗓️')
    )
    .addSubcommand(cmd =>
      cmd.setName('תוצאות').setDescription('ניהול לוח תוצאות 🏆')
    )
    .addSubcommand(cmd =>
      cmd.setName('עדכון_חוקים').setDescription('עדכון חוקים 🔧')
    )
    .addSubcommand(cmd =>
      cmd.setName('סטטיסטיקות_חוקים').setDescription('צפה בסטטיסטיקות החוקים 📑')
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    switch(sub) {
      case 'שמעון':
        return require('./ttsCommand').execute(interaction);
      case 'לוח_פעילות':
        return require('./activityBoard').execute(interaction, interaction.client);
      case 'תוצאות':
        return require('./leaderboard').execute(interaction);
      case 'עדכון_חוקים':
        return require('./refreshRules').execute(interaction);
      case 'סטטיסטיקות_חוקים':
        return require('./rulesStats').execute(interaction);
      default:
        return interaction.reply({ content: 'פקודת ניהול לא מוכרת.', ephemeral: true });
    }
  }
};

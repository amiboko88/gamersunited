const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('קהילה')
    .setDescription('כל הפיצ׳רים המרכזיים של הקהילה 👥')
    .addSubcommand(cmd =>
      cmd.setName('song').setDescription('נגן שיר 🎵')
    )
    .addSubcommand(cmd =>
      cmd.setName('fifo').setDescription('מצב פיפו 🎮')
    )
    .addSubcommand(cmd =>
      cmd.setName('verify').setDescription('אימות משתמש חדש ✅')
    )
    .addSubcommand(cmd =>
      cmd.setName('mvp').setDescription('מצטיין השבוע 🏅')
    )
    .addSubcommand(cmd =>
      cmd.setName('birthdays').setDescription('ימי הולדת קרובים 📅')
    )
    .addSubcommand(cmd =>
      cmd.setName('addbirthday').setDescription('הוסף יום הולדת 🎂')
    )
    .addSubcommand(cmd =>
      cmd.setName('nextbirthday').setDescription('מי חוגג הכי קרוב? 🔜')
    )
    .addSubcommand(cmd =>
      cmd.setName('soundboard').setDescription('השמע סאונד מצחיק 🔊')
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    switch(sub) {
      case 'song':
        return require('./song').execute(interaction, interaction.client);
      case 'fifo':
        return require('./fifo').execute(interaction);
      case 'verify':
        return require('./verify').execute(interaction);
      case 'mvp':
        return require('./mvpDisplay').execute(interaction, interaction.client);
      case 'birthdays':
      case 'addbirthday':
      case 'nextbirthday':
        return require('./birthdayCommands').execute(interaction);
      case 'soundboard':
        return require('./soundboard').execute(interaction, interaction.client);
      default:
        return interaction.reply({ content: 'פקודה לא מוכרת.', ephemeral: true });
    }
  }
};

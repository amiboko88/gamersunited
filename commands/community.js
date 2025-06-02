const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('קהילה')
    .setDescription('הפקודות המרכזיות של הקהילה 👥')
    .addSubcommand(cmd =>
      cmd.setName('שיר').setDescription('נגן שיר 🎵')
    )
    .addSubcommand(cmd =>
      cmd.setName('פיפו').setDescription('הפעל מצב פיפו 🎮')
    )
    .addSubcommand(cmd =>
      cmd.setName('אימות').setDescription('אימות משתמש חדש ✅')
    )
    .addSubcommand(cmd =>
      cmd.setName('מצטיין').setDescription('מצטיין השבוע 🏅')
    )
    .addSubcommand(cmd =>
      cmd.setName('ימי_הולדת').setDescription('רשימת ימי הולדת קרובים 📅')
    )
    .addSubcommand(cmd =>
      cmd.setName('הוסף_יום_הולדת').setDescription('הוסף יום הולדת 🎂')
    )
    .addSubcommand(cmd =>
      cmd.setName('חגיגות').setDescription('מי חוגג הכי קרוב? 🔜')
    )
    .addSubcommand(cmd =>
      cmd.setName('סאונדבורד').setDescription('השמע סאונד מצחיק 🔊')
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    switch(sub) {
      case 'שיר':
        return require('./song').execute(interaction, interaction.client);
      case 'פיפו':
        return require('./fifo').execute(interaction);
      case 'אימות':
        return require('./verify').execute(interaction);
      case 'מצטיין':
        return require('./mvpDisplay').execute(interaction, interaction.client);
      case 'ימי_הולדת':
      case 'הוסף_יום_הולדת':
      case 'חוגג_הבא':
        return require('./birthdayCommands').execute(interaction);
      case 'סאונדבורד':
        return require('./soundboard').execute(interaction, interaction.client);
      default:
        return interaction.reply({ content: 'פקודה לא מוכרת.', ephemeral: true });
    }
  }
};

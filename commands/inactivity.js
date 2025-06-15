const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inactivity')
    .setDescription('🔍 ניהול משתמשים לא פעילים')
    .addSubcommand(sub =>
      sub.setName('list').setDescription('📋 הצג משתמשים שטרם קיבלו DM'))
    .addSubcommand(sub =>
      sub.setName('not_replied').setDescription('📛 קיבלו DM ולא ענו'))
    .addSubcommand(sub =>
      sub.setName('replied').setDescription('📨 הצג מי שענה ל־DM')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return require('./inactivity/list')(interaction);
    if (sub === 'not_replied') return require('./inactivity/not_replied')(interaction);
    if (sub === 'replied') return require('./inactivity/replied')(interaction);
  }
};

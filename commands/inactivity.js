const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inactivity')
    .setDescription('🔍 ניהול משתמשים לא פעילים')
    .addSubcommand(sub =>
      sub.setName('panel').setDescription('📋 פתח לוח ניהול משתמשים')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'panel') return;

    const embed = new EmbedBuilder()
      .setTitle('📋 לוח ניהול משתמשים לא פעילים')
      .setDescription('בחר באחת מהפעולות הבאות כדי לנהל משתמשים שלא היו פעילים לאחרונה.')
      .setColor(0x007acc)
      .setFooter({ text: 'Shimon BOT — Inactivity Manager' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('send_dm_batch_list')
        .setLabel('📨 שלח DM לכולם')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('send_dm_batch_final_check')
        .setLabel('🚨 שלח תזכורת סופית')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};

// 📁 commands/birthdayPanel.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthdaypanel')
    .setDescription('🎉 מרכז ניהול ימי הולדת'),

  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    const embed = new EmbedBuilder()
      .setTitle('🎂 ניהול ימי הולדת')
      .setDescription('בחר פעולה מתפריט הניהול 👇')
      .setColor('Purple')
      .setFooter({ text: 'שמעון – מזל טוב זה החיים 🎈' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bday_list')
        .setLabel('🎁 רשימת ימי הולדת')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('bday_next')
        .setLabel('🔮 היום הולדת הבא')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('bday_add')
        .setLabel('➕ הוסף יום הולדת')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('bday_missing')
        .setLabel('❓ ימי הולדת חסרים')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isAdmin)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};

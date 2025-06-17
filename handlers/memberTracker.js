// 📁 memberTracker.js
const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('inactivity')
  .setDescription('ניהול משתמשים לא פעילים')
  .addSubcommand(sub =>
    sub.setName('panel').setDescription('📋 פתח לוח ניהול משתמשים')
  );

const execute = async (interaction) => {
  const sub = interaction.options.getSubcommand();
  if (sub === 'panel') return await runPanel(interaction);
};

async function runPanel(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({
      content: '⛔ הפקודה הזו זמינה רק לאדמינים עם הרשאת ADMINISTRATOR.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 לוח ניהול משתמשים לא פעילים')
    .setDescription('בחר פעולה לניהול משתמשים שלא היו פעילים לאחרונה.')
    .setColor(0x007acc)
    .setFooter({ text: 'Shimon BOT — Inactivity Manager' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('send_dm_batch_list')
      .setLabel('שלח DM לכולם 🔵')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('send_dm_batch_final_check')
      .setLabel('שלח תזכורת סופית 🔴')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('show_failed_list')
      .setLabel('רשימת נכשלים ❌')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('show_replied_list')
      .setLabel('הגיבו ל־DM 💬')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('kick_failed_users')
      .setLabel('העף חסומים 🛑')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  });
}

module.exports = {
  data,
  execute,
};

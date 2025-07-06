const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('ניהול_שבורים')
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
    .setTitle('📋 לוח ניהול המשתמשים הלא פעילים')
    .setDescription('בחר פעולה לניהול משתמשים שלא היו פעילים לאחרונה:')
    .setColor(0x007acc)
    .setFooter({ text: 'Shimon BOT — Inactivity Manager' });

  const dmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('send_dm_batch_list')
      .setLabel('🔵 שלח תזכורת רגילה')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('send_dm_batch_final_check')
      .setLabel('🔴 שלח תזכורת סופית')
      .setStyle(ButtonStyle.Danger)
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inactivity_action_select')
      .setPlaceholder('בחר פעולה מתקדמת')
      .addOptions(
        {
          label: '📊 סטטוס נוכחי',
          description: 'צפייה בחלוקה לפי סטטוס stage',
          value: 'show_status_summary'
        },
        {
          label: '❌ משתמשים שנכשל DM אליהם',
          description: 'מי לא הצלחנו לשלוח לו הודעה',
          value: 'show_failed_list'
        },
        {
          label: '💬 משתמשים שהגיבו ל־DM',
          description: 'מי ענה לנו בהצלחה',
          value: 'show_replied_list'
        },
        {
          label: '🛑 בעיטת משתמשים לא פעילים וחסומים',
          description: 'Kick למשתמשים שעברו הכל ולא ענו',
          value: 'kick_failed_users'
        }
      )
  );

  await interaction.reply({
    embeds: [embed],
    components: [dmRow, selectRow],
    ephemeral: true,
  });
}

module.exports = {
  data,
  execute,
};

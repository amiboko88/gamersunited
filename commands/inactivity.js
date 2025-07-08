const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('משתמשים')
  .setDescription('ניהול משתמשים לא פעילים')
  .addSubcommand(sub =>
    sub.setName('ניהול').setDescription('📋 פתח לוח ניהול משתמשים')
  );

const execute = async (interaction) => {
  const sub = interaction.options.getSubcommand();
  if (sub === 'panel') return await runPanel(interaction);
};

async function runPanel(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({
      content: '⛔ הפקודה הזו זמינה רק לאדמינים עם הרשאת ADMINISTRATOR.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛠️ מרכז ניהול פעילות משתמשים')
    .setDescription([
      '👁️‍🗨️ כל התזכורות והסטטוסים מנוטרים ע״י שמעון בזמן אמת.',
      'בחר את סוג הפעולה שתרצה לבצע או לצפות במצב הנוכחי.'
    ].join('\n'))
    .setColor(0x00aaff)
    .addFields(
      { name: '🔍 מצב ניטור נוכחי:', value: '📡 מנוטר אוטומטית', inline: true },
      { name: '🗓️ עדכון סטטוסים:', value: 'כל 10 דקות ⏱️', inline: true },
      { name: '📋 ניתוח סטטוס:', value: 'תצוגה גרפית מלאה בלחיצה', inline: true }
    )
    .setFooter({ text: 'Shimon BOT — Inactivity Monitor' })
    .setTimestamp();

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
      .setPlaceholder('בחר פעולה מתקדמת ⬇️')
.addOptions(
  {
    label: '📊 סטטוס נוכחי',
    description: 'פילוח גרפי לפי statusStage',
    value: 'show_status_summary'
  },
  {
    label: '❌ משתמשים שנכשל DM אליהם',
    description: 'לא ניתן היה לשלוח להם הודעה',
    value: 'show_failed_list'
  },
  {
    label: '💬 משתמשים שהגיבו ל־DM',
    description: 'רשימת מגיבים פרטיים',
    value: 'show_replied_list'
  },
  {
    label: '🛑 העף משתמשים לא פעילים + חסומים',
    description: 'הרחקת משתמשים שסיימו תהליך ולא הגיבו',
    value: 'kick_failed_users'
  },
  {
    label: '⏱️ לא פעיל 7+ ימים',
    description: 'משתמשים שלא נראו 7 ימים לפחות',
    value: 'inactive_7'
  },
  {
    label: '⌛ לא פעיל 14+ ימים',
    description: 'משתמשים לא פעילים שבועיים',
    value: 'inactive_14'
  },
  {
    label: '🛑 לא פעיל 30+ ימים',
    description: 'חודש שלם ללא פעילות',
    value: 'inactive_30'
  }
)

  );

  await interaction.reply({
    embeds: [embed],
    components: [dmRow, selectRow],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data,
  execute,
};

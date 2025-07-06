const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');

const data = new SlashCommandBuilder()
  .setName('סנכרון_סטטוס_משתמשים')
  .setDescription('🔄 סנכרון סטטוס חכם לכל המשתמשים ב־Firestore')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const execute = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });

  const snapshot = await db.collection('memberTracking').get();
  const now = Date.now();
  const stats = {
    joined: 0,
    waiting_activity: 0,
    active: 0,
    dm_sent: 0,
    final_warning: 0,
    responded: 0,
    kicked: 0,
    failed_dm: 0
  };

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const userId = doc.id;
    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const daysInactive = (now - last) / 86400000;
    const reminders = d.reminderCount || 0;

    let status = 'joined';

    if (d.replied) status = 'responded';
    else if (d.dmFailed && daysInactive > 30) status = 'kicked';
    else if (reminders >= 2) status = 'final_warning';
    else if (d.dmFailed) status = 'failed_dm';
    else if (d.dmSent) status = 'dm_sent';
    else if (d.lastActivity) status = 'active';
    else status = 'waiting_activity';

    stats[status] = (stats[status] || 0) + 1;

    await doc.ref.set({ statusStage: status }, { merge: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ סנכרון סטטוס המשתמשים הושלם')
    .setColor(0x2ecc71)
    .setDescription(`נסרקו ${snapshot.size} משתמשים.`)
    .addFields(
      { name: '🆕 joined', value: String(stats.joined), inline: true },
      { name: '⌛ waiting_activity', value: String(stats.waiting_activity), inline: true },
      { name: '✅ active', value: String(stats.active), inline: true },
      { name: '📩 dm_sent', value: String(stats.dm_sent), inline: true },
      { name: '🔴 final_warning', value: String(stats.final_warning), inline: true },
      { name: '💬 responded', value: String(stats.responded), inline: true },
      { name: '🚫 kicked', value: String(stats.kicked), inline: true },
      { name: '❌ failed_dm', value: String(stats.failed_dm), inline: true }
    )
    .setFooter({ text: 'Shimon BOT – User Status Sync' })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
};

module.exports = { data, execute };

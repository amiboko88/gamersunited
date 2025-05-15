const { WebhookClient, EmbedBuilder } = require('discord.js');

const webhookUrl = process.env.LOG_WEBHOOK_URL;
const webhook = webhookUrl ? new WebhookClient({ url: webhookUrl }) : null;

// טקסט רגיל – קיים אצלך
function logText(message) {
  console.log(message);
  if (webhook) {
    webhook.send({ content: `📢 ${message}` }).catch(() => {});
  }
}

// Embed לתיעוד תפקידים
function logRoleChange({ member, action, roleName, gameName }) {
  if (!webhook) return;

  const embed = new EmbedBuilder()
    .setTitle(action === 'add' ? '✅ תפקיד נוסף' : '❌ תפקיד הוסר')
    .setColor(action === 'add' ? 0x57F287 : 0xED4245)
    .setDescription(`**${member.user.tag}** (${member.id})`)
    .addFields(
      { name: 'תפקיד', value: roleName, inline: true },
      gameName ? { name: 'משחק', value: gameName, inline: true } : null
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp()
    .setFooter({ text: 'שימי הבוט – מערכת תיעוד חכמה' });

  webhook.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  log: logText,
  logRoleChange
};

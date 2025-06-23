const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./firebase');

const REPORT_CHANNEL_ID = '881445829100060723'; // עדכן לערוץ הצוות שלך

async function generateWeeklyReport(client) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const snapshot = await db.collection('memberTracking')
    .where('dmSent', '==', true)
    .get();

  const replied = [];
  const notReplied = [];
  const secondReminder = [];

  snapshot.forEach(doc => {
    const d = doc.data();
    const sentAt = new Date(d.dmSentAt || 0).getTime();
    const isThisWeek = sentAt >= sevenDaysAgo;

    if (!isThisWeek) return;

    if (d.replied) {
      replied.push(`<@${doc.id}>`);
    } else {
      notReplied.push(`<@${doc.id}>`);
      if ((d.reminderCount || 0) >= 2) {
        secondReminder.push(`<@${doc.id}>`);
      }
    }
  });

  const embed = new EmbedBuilder()
    .setTitle('📊 דוח פעילות שבועי – Gamers United IL')
    .setDescription(`בשבוע האחרון נשלחו תזכורות ל־**${replied.length + notReplied.length}** משתמשים.`)
    .addFields(
      { name: '✅ הגיבו ל־DM:', value: replied.length ? replied.join(', ') : 'אין', inline: false },
      { name: '❌ לא הגיבו:', value: notReplied.length ? notReplied.join(', ') : 'כולם הגיבו!', inline: false },
      { name: '🔴 קיבלו 2 תזכורות:', value: secondReminder.length ? secondReminder.join(', ') : 'אין', inline: false }
    )
    .setFooter({ text: 'Shimon BOT – Weekly Summary' })
    .setColor(0x3498db)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('show_failed_list')
      .setLabel('רשימת נכשלים ❌')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('show_replied_list')
      .setLabel('הגיבו ל־DM 💬')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('kick_failed_users')
      .setLabel('העף חסומים 🛑')
      .setStyle(ButtonStyle.Danger)
  );

  const channel = client.channels.cache.get(REPORT_CHANNEL_ID);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed], components: [row] });
  }
}

module.exports = { generateWeeklyReport };

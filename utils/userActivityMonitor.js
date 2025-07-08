const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/firebase');
const admin = require('firebase-admin');

const REPORT_CHANNEL_ID = '881445829100060723';
const STATUS_FIELD = 'statusStage';
const INACTIVITY_THRESHOLD_DAYS = 7;
const seenStatuses = new Map();

function translateStatus(key) {
  return {
    joined: '🆕 הצטרף',
    waiting_activity: '⌛ מחכה לפעולה',
    active: '✅ פעיל',
    dm_sent: '📩 תזכורת נשלחה',
    final_warning: '🔴 תזכורת סופית',
    responded: '💬 ענה',
    kicked: '🚫 נבעט',
    failed_dm: '❌ נכשל DM',
    left: '🚪 עזב',
    unknown: '❓ לא ידוע'
  }[key] || key;
}

async function logToStaff(client, title, description, color = 0x3498db) {
  const channel = client.channels.cache.get(REPORT_CHANNEL_ID);
  if (channel?.isTextBased()) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

async function scanAndReport(client) {
  const snapshot = await db.collection('memberTracking').get();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const replied = [], notReplied = [], secondReminder = [];
  const summary = {};

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    const d = doc.data();
    const currentStatus = d[STATUS_FIELD] || 'unknown';
    const previousStatus = seenStatuses.get(userId);

    if (previousStatus && currentStatus !== previousStatus) {
      await logToStaff(
        client,
        '🔄 שינוי סטטוס משתמש',
        `‏<@${userId}>: ‏**${translateStatus(previousStatus)} → ${translateStatus(currentStatus)}**`,
        0xf39c12
      );
    }

    seenStatuses.set(userId, currentStatus);
    summary[currentStatus] = (summary[currentStatus] || 0) + 1;

    // ניקוי התראה אם חזר לפעילות
    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const activeNow = (now - last) < INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

    if (activeNow && d.notifiedInactive) {
      await doc.ref.set({ notifiedInactive: admin.firestore.FieldValue.delete() }, { merge: true });
    }

    // סטטיסטיקה ל־DM
    const sentAt = new Date(d.dmSentAt || 0).getTime();
    const isThisWeek = sentAt >= sevenDaysAgo;

    if (d.dmSent && isThisWeek) {
      if (d.replied) replied.push(`<@${userId}>`);
      else {
        notReplied.push(`<@${userId}>`);
        if ((d.reminderCount || 0) >= 2) secondReminder.push(`<@${userId}>`);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 דוח פעילות כולל – Gamers United IL')
    .setDescription(`נסרקו **${snapshot.size}** משתמשים. להלן הפילוח:`)
    .addFields(
      { name: '✅ הגיבו ל־DM:', value: replied.length ? replied.join(', ') : 'אין', inline: false },
      { name: '❌ לא הגיבו:', value: notReplied.length ? notReplied.join(', ') : 'כולם הגיבו!', inline: false },
      { name: '🔴 קיבלו 2 תזכורות:', value: secondReminder.length ? secondReminder.join(', ') : 'אין', inline: false },
      {
        name: '📊 פילוח סטטוסים:',
        value: Object.entries(summary)
          .map(([k, v]) => `${translateStatus(k)}: **${v}**`)
          .join('\n'),
        inline: false
      }
    )
    .setColor(0x3498db)
    .setFooter({ text: 'Shimon BOT — Inactivity Monitor' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_failed_list').setLabel('❌ נכשל DM').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_replied_list').setLabel('💬 הגיבו ל־DM').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('kick_failed_users').setLabel('🛑 העף חסומים').setStyle(ButtonStyle.Danger)
  );

  const channel = client.channels.cache.get(REPORT_CHANNEL_ID);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed], components: [row] });
  }
}

async function alertOnInactiveUsers(client) {
  const snapshot = await db.collection('memberTracking').get();
  const now = Date.now();
  const threshold = INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const stale = [];

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const userId = doc.id;

    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const days = Math.floor((now - last) / 86400000);

    if (
      days >= INACTIVITY_THRESHOLD_DAYS &&
      !d.notifiedInactive &&
      d.statusStage !== 'left' &&
      d.statusStage !== 'kicked'
    ) {
      stale.push({ userId, days });
      await doc.ref.set({ notifiedInactive: true }, { merge: true });
    }
  }

  if (!stale.length) return;

  const list = stale.map(u => `• <@${u.userId}> – ${u.days} ימים`).join('\n');
  await logToStaff(client, '📢 משתמשים לא פעילים לחלוטין', list, 0xe74c3c);
}

function startLiveMonitor(client) {
  scanAndReport(client);
  alertOnInactiveUsers(client);
  setInterval(() => {
    scanAndReport(client);
    alertOnInactiveUsers(client);
  }, 10 * 60 * 1000);
}

module.exports = { startLiveMonitor };

const db = require('../utils/firebase');
const { EmbedBuilder, Collection, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const smartChat = require('./smartChat');

const STAFF_CHANNEL_ID = '881445829100060723';
const INACTIVITY_DAYS = 7;

let lastInactiveIds = [];

function hasChanged(current) {
  const ids = current.map(u => u.id).sort();
  const changed = ids.length !== lastInactiveIds.length ||
    ids.some((id, i) => id !== lastInactiveIds[i]);

  if (changed) lastInactiveIds = ids;
  return changed;
}

async function startAutoTracking(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const snapshot = await db.collection('memberTracking').get();

  const now = Date.now();
  const all = [];

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const userId = doc.id;
    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const days = Math.floor((now - last) / 86400000);

    const member = members.get(userId);
    if (!member || member.user.bot || userId === client.user.id) continue;

    if (days >= INACTIVITY_DAYS && !['left', 'kicked'].includes(d.statusStage)) {
      all.push({ id: userId, days, tag: member.user.username });
    }
  }

  if (!hasChanged(all)) return;

  const group1 = all.filter(u => u.days >= 7 && u.days <= 13);
  const group2 = all.filter(u => u.days >= 14 && u.days <= 20);
  const group3 = all.filter(u => u.days > 20);

  const embed = new EmbedBuilder()
    .setTitle('📢 משתמשים לא פעילים לחלוטין')
    .addFields(
      {
        name: '🕒 7–13 ימים',
        value: group1.length ? group1.map(u => `• <@${u.id}> – ${u.days} ימים`).join('\n') : '—',
        inline: false
      },
      {
        name: '⏳ 14–20 ימים',
        value: group2.length ? group2.map(u => `• <@${u.id}> – ${u.days} ימים`).join('\n') : '—',
        inline: false
      },
      {
        name: '🚨 21+ ימים',
        value: group3.length ? group3.map(u => `• <@${u.id}> – ${u.days} ימים`).join('\n') : '—',
        inline: false
      }
    )
    .setColor(0xe67e22)
    .setFooter({ text: `Shimon BOT – זיהוי משתמשים לא פעילים (${all.length})` })
    .setTimestamp();

  const channel = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed] });
  }
}

async function sendReminderDM(client, guild, members, userId, isFinal = false) {
  const docRef = db.collection('memberTracking').doc(userId);
  const doc = await docRef.get();
  const d = doc.exists ? doc.data() : {};
  const now = Date.now();
  const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
  const daysInactive = Math.floor((now - last) / 86400000);

  const memberReal = members.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const user = memberReal?.user || await client.users.fetch(userId).catch(() => null);
  if (!user || typeof user.send !== 'function') return false;

  const fakeMessage = {
    content: '',
    author: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bot: user.bot
    },
    member: memberReal || {
      displayName: user.username,
      permissions: { has: () => false },
      roles: { cache: new Collection() }
    },
    channel: { id: '000' },
    client,
    _simulateOnly: true
  };

  const prompt = `${user.username} לא היה פעיל כבר ${daysInactive} ימים.\n` +
    `${isFinal ? 'זוהי תזכורת סופית' : 'זו תזכורת רגילה'}.\n` +
    `כתוב לו הודעה ${isFinal ? 'ישירה וקשוחה' : 'חברית ומעודדת'}, שתעודד אותו להשתתף בשרת.\n` +
    `הסבר לו שהוא עבר אימות אך עדיין לא לקח חלק.`;

  fakeMessage.content = prompt;

  let dm;
  try {
    dm = await smartChat.smartRespond(fakeMessage, isFinal ? 'קשוח' : 'רגיש');
  } catch (err) {
    console.warn(`❌ smartRespond נכשל עבור ${user.username}:`, err.message);
    return false;
  }

  if (!dm || typeof dm !== 'string' || dm.length < 2) return false;

  try {
    await user.send(dm);
  } catch (err) {
    console.warn(`❌ נכשל DM ל־${user.username}:`, err.message);
    try {
      const { sendFallbackButton } = require('./dmFallbackModal');
      const row = new ActionRowBuilder().addComponents(sendFallbackButton(userId));
      const dmChan = await user.createDM();
      await dmChan.send({ content: '🔔 לא הצלחנו לשלוח הודעה רשמית. לחץ כאן להשלמה:', components: [row] });
    } catch (fallbackErr) {
      console.warn(`⚠️ נכשל גם fallback ל־${user.username}:`, fallbackErr.message);
    }

    await docRef.set({
      dmFailed: true,
      dmFailedAt: new Date().toISOString(),
      statusStage: 'failed_dm'
    }, { merge: true });

    return false;
  }

  const updates = {
    dmSent: true,
    dmSentAt: new Date().toISOString(),
    reminderCount: isFinal ? 3 : 1,
    statusStage: isFinal ? 'final_warning' : 'dm_sent'
  };

  await docRef.set(updates, { merge: true });
  return true;
}
async function handleMemberButtons(interaction, client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const allTracked = await db.collection('memberTracking').get();
  const value = interaction.values?.[0];
  const action = interaction.customId === 'inactivity_action_select' ? value : interaction.customId;

  // 📩 שליחת DM רגיל
  if (action === 'send_dm_batch_list') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const daysInactive = (now - last) / 86400000;

      if (!(daysInactive > INACTIVITY_DAYS && !d.dmSent && !d.dmFailed)) continue;

      const sent = await sendReminderDM(client, guild, members, userId, false);
      if (sent) count++;
    }

    return interaction.editReply({
      content: `📤 נשלחו תזכורות רגילות ל־${count} משתמשים.`,
      flags: MessageFlags.Ephemeral
    });
  }

  // 🔴 שליחת DM סופית
  if (action === 'send_dm_batch_final_check') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const daysInactive = (now - last) / 86400000;

      if (!(daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && !d.dmFailed)) continue;

      const sent = await sendReminderDM(client, guild, members, userId, true);
      if (sent) count++;
    }

    return interaction.editReply({
      content: `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`,
      flags: MessageFlags.Ephemeral
    });
  }
  // 🛑 בעיטת משתמשים חסומים
  if (action === 'kick_failed_users') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    let notInGuild = [];
    let failedKick = [];
    let kickedList = [];

    const eligibleToKick = allTracked.docs.filter(doc => {
      const d = doc.data();
      return ['failed_dm', 'final_warning'].includes(d.statusStage || '');
    });

    for (const doc of eligibleToKick) {
      const userId = doc.id;
      const member = members.get(userId);

      if (!member) {
        notInGuild.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).delete();
        continue;
      }

      try {
        await member.kick('בעיטה לפי סטטוס – לא פעיל + חסום + לא הגיב');
        await db.collection('memberTracking').doc(userId).delete();
        kickedList.push(`<@${userId}>`);
        count++;
      } catch {
        failedKick.push(`<@${userId}>`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🛑 בעיטת משתמשים חסומים ולא פעילים')
      .setDescription([
        `👢 הורחקו: ${count}`,
        kickedList.length ? kickedList.join('\n') : '—',
        `🚫 לא בשרת: ${notInGuild.length}`,
        `⚠️ נכשלו בהרחקה: ${failedKick.length}`
      ].join('\n'))
      .setColor(0xff3300)
      .setTimestamp();

    const staff = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    if (staff?.isTextBased()) {
      await staff.send({ embeds: [embed] });
    }

    return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לצוות.', flags: MessageFlags.Ephemeral });
  }

  // 💬 הצגת מי שענה ל־DM
  if (action === 'show_replied_list') {
    const replied = allTracked.docs.filter(doc => doc.data().replied);
    if (!replied.length) {
      return interaction.reply({ content: 'אף אחד לא ענה ל־DM עדיין.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('💬 משתמשים שהגיבו ל־DM')
      .setDescription(replied.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0x00cc99);

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ❌ הצגת משתמשים שנכשל DM אליהם
  if (action === 'show_failed_list') {
    const failedUsers = allTracked.docs.filter(doc => doc.data().dmFailed);
    if (!failedUsers.length) {
      return interaction.reply({ content: 'אין משתמשים שנכשל DM אליהם.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('❌ משתמשים שנכשל DM אליהם')
      .setDescription(failedUsers.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0xff0000);

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // 📊 משתמשים לא פעילים X ימים
  if (action.startsWith('inactive_')) {
    const days = parseInt(action.split('_')[1]);
    const now = Date.now();

    const matches = allTracked.docs.filter(doc => {
      const d = doc.data();
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const inactiveDays = (now - last) / 86400000;
      return inactiveDays >= days && !['left', 'kicked'].includes(d.statusStage);
    });

    if (!matches.length) {
      return interaction.reply({ content: `אין משתמשים עם חוסר פעילות של ${days}+ ימים.`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${days}+ ימים ללא פעילות`)
      .setDescription(matches.map(doc => `• <@${doc.id}>`).join('\n').slice(0, 4000))
      .setColor(0xe67e22)
      .setFooter({ text: `Shimon BOT – ניטור פעילות • ${matches.length} משתמשים` });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  return false;
}

module.exports = {
  handleMemberButtons,
  startAutoTracking
};

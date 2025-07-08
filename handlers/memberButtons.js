const db = require('../utils/firebase');
const { EmbedBuilder, Collection, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const smartChat = require('./smartChat');
const admin = require('firebase-admin');

const STAFF_CHANNEL_ID = '881445829100060723';
const INACTIVITY_DAYS = 30;

async function handleMemberButtons(interaction, client) {
  const allTracked = await db.collection('memberTracking').get();
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const value = interaction.values?.[0];
  const action = interaction.customId === 'inactivity_action_select' ? value : interaction.customId;

  // 🔵 שליחת DM רגיל
  if (action === 'send_dm_batch_list') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    let failed = [];
    let notInGuild = [];
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      if (!(daysInactive > INACTIVITY_DAYS && !d.dmSent && !d.dmFailed)) continue;
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }

      const user = await client.users.fetch(userId).catch(() => null);
      if (!user || typeof user.send !== 'function') {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          statusStage: 'failed_dm',
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
        continue;
      }

      try {
        const memberReal = await guild.members.fetch(user.id).catch(() => null);
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

        const prompt = `${user.username} לא היה פעיל כבר ${Math.floor(daysInactive)} ימים.\n` +
          `זו תזכורת רגילה.\nכתוב לו הודעה חברית ומעודדת שתעודד אותו להשתתף בשרת.\n` +
          `הסבר לו שהוא עבר אימות אך עדיין לא לקח חלק.`;

        fakeMessage.content = prompt;
        const dm = await smartChat.smartRespond(fakeMessage, 'רגיש');

        if (!dm || typeof dm !== 'string' || dm.length < 2) throw new Error('DM ריק או לא תקין');
        try {
          await user.send(dm);
        } catch {
          const { sendFallbackButton } = require('./dmFallbackModal');
          const row = new ActionRowBuilder().addComponents(sendFallbackButton(userId));
          const dmChan = await user.createDM();
          await dmChan.send({ content: '🔔 לא הצלחנו לשלוח לך הודעה רשמית. לחץ כדי להשלים תהליך:', components: [row] });
        }

        await db.collection('memberTracking').doc(userId).set({
          dmSent: true,
          dmSentAt: new Date().toISOString(),
          reminderCount: 1,
          statusStage: 'dm_sent'
        }, { merge: true });

        count++;
      } catch (err) {
        console.error(`❌ שגיאה ב־DM ל־${userId}:`, err.message);
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          statusStage: 'failed_dm',
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    let msg = `✅ נשלחו תזכורות ל־${count} משתמשים.`;
    if (notInGuild.length) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length) msg += `\n❌ נכשל DM: ${failed.join(', ')}`;
    return interaction.editReply({ content: msg });
  }
  // 🔴 שליחת תזכורת סופית
  if (action === 'send_dm_batch_final_check') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    let failed = [];
    let notInGuild = [];
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      if (!(daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && !d.dmFailed)) continue;
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }

      const user = await client.users.fetch(userId).catch(() => null);
      if (!user || typeof user.send !== 'function') {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          statusStage: 'failed_dm',
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
        continue;
      }

      try {
        const memberReal = await guild.members.fetch(user.id).catch(() => null);
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

        const prompt = `${user.username} לא היה פעיל כבר ${Math.floor(daysInactive)} ימים.\n` +
          `זוהי תזכורת סופית.\nכתוב לו הודעה ישירה וקשוחה שתבהיר לו את המצב.` +
          `הסבר לו שעבר אימות, אבל טרם השתתף בפועל.`;

        fakeMessage.content = prompt;
        const dm = await smartChat.smartRespond(fakeMessage, 'קשוח');

        if (!dm || typeof dm !== 'string' || dm.length < 2) throw new Error('DM שגוי');
        try {
          await user.send(dm);
        } catch {
          const { sendFallbackButton } = require('./dmFallbackModal');
          const row = new ActionRowBuilder().addComponents(sendFallbackButton(userId));
          const dmChan = await user.createDM();
          await dmChan.send({ content: '🔔 לא הצלחנו לשלוח תזכורת. לחץ להשלמה:', components: [row] });
        }

        await db.collection('memberTracking').doc(userId).set({
          dmSentAt: new Date().toISOString(),
          reminderCount: 3,
          statusStage: 'final_warning'
        }, { merge: true });

        count++;
      } catch (err) {
        console.error(`❌ תזכורת סופית נכשלה ל־${userId}:`, err.message);
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          statusStage: 'failed_dm',
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    let msg = `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`;
    if (notInGuild.length) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length) msg += `\n❌ נכשל DM: ${failed.join(', ')}`;
    return interaction.editReply({ content: msg });
  }

  // 📊 סטטוס נוכחי
  if (action === 'show_status_summary') {
    const count = allTracked.size;
    const summary = {};

    for (const doc of allTracked.docs) {
      const s = doc.data().statusStage || 'unknown';
      summary[s] = (summary[s] || 0) + 1;
    }

    const fields = Object.entries(summary).map(([k, v]) => ({
      name: translateStatus(k),
      value: `**${v}** משתמשים`,
      inline: true
    }));

    const embed = new EmbedBuilder()
      .setTitle('📊 סטטוס נוכחי של משתמשים')
      .addFields(fields)
      .setColor(0x2ecc71)
      .setFooter({ text: 'Shimon BOT – ניתוח לפי statusStage' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ❌ DM נכשל
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

  // 💬 הגיבו ל־DM
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
  // 🛑 בעיטת משתמשים לפי סטטוס
  if (action === 'kick_failed_users') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let count = 0;
    let notInGuild = [];
    let failedKick = [];

    const eligibleToKick = allTracked.docs.filter(doc => {
      const d = doc.data();
      const stage = d.statusStage || '';
      return ['failed_dm', 'final_warning'].includes(stage);
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
        await member.kick('בעיטה אוטומטית לפי סטטוס – לא פעיל + חסום + לא הגיב');
        await db.collection('memberTracking').doc(userId).delete();
        count++;
      } catch {
        failedKick.push(`<@${userId}>`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🛑 בעיטת משתמשים חסומים ולא פעילים')
      .setDescription(`👢 הורחקו: ${count}\n🚫 לא בשרת: ${notInGuild.length}\n⚠️ נכשלו בהרחקה: ${failedKick.length}`)
      .setColor(0xff3300)
      .setTimestamp();

    const staff = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    if (staff?.isTextBased()) {
      await staff.send({ embeds: [embed] });
    }

    return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לצוות.', flags: MessageFlags.Ephemeral });
  }

  // ⏱️ הצגת לא פעילים X ימים
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

module.exports = { handleMemberButtons };

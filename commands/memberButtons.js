// 📁 commands/memberButtons.js
const db = require('../utils/firebase');
const { EmbedBuilder } = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const INACTIVITY_DAYS = 30;

async function handleMemberButtons(interaction, client) {
  const allTracked = await db.collection('memberTracking').get();
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  // 🔵 שליחת DM ראשוני
  if (interaction.customId === 'send_dm_batch_list') {
    await interaction.deferReply({ ephemeral: true });

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
      if (!user) {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({ dmFailed: true, dmFailedAt: new Date().toISOString() }, { merge: true });
        continue;
      }

      try {
        const smartChat = require('../handlers/smartChat');
        const prompt = 'אתה שמעון, בוט גיימרים ישראלי. כתוב תזכורת נעימה למשתמש לא פעיל חודש.';
        const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);

        console.log(`📤 תזכורת רגילה ל־${userId}:`, dm);

        if (!dm || typeof dm !== 'string' || dm.length < 2) throw new Error('הודעת DM ריקה או שגויה');

        await user.send(dm);

        await db.collection('memberTracking').doc(userId).set({
          dmSent: true,
          dmSentAt: new Date().toISOString(),
          reminderCount: 1
        }, { merge: true });

        count++;
      } catch (err) {
        console.error(`❌ נכשל DM ל־${userId}:`, err.message);
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    let msg = `✅ נשלחו תזכורות ל־${count} משתמשים.`;
    if (notInGuild.length) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length) msg += `\n❌ נכשל DM: ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }

  // 🔴 שליחת תזכורת סופית
  if (interaction.customId === 'send_dm_batch_final_check') {
    await interaction.deferReply({ ephemeral: true });

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
      if (!user) {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({ dmFailed: true, dmFailedAt: new Date().toISOString() }, { merge: true });
        continue;
      }

      try {
        const smartChat = require('../handlers/smartChat');
        const prompt = 'אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת סופית למשתמש שהתעלם מהודעות קודמות.';
        const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);

        console.log(`📤 תזכורת סופית ל־${userId}:`, dm);

        if (!dm || typeof dm !== 'string' || dm.length < 2) throw new Error('הודעת תזכורת סופית ריקה או שגויה');

        await user.send(dm);

        await db.collection('memberTracking').doc(userId).set({
          reminderCount: 3,
          dmSentAt: new Date().toISOString()
        }, { merge: true });

        count++;
      } catch (err) {
        console.error(`❌ נכשל תזכורת סופית ל־${userId}:`, err.message);
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    let msg = `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`;
    if (notInGuild.length) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length) msg += `\n❌ נכשל DM: ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }
  // ❌ רשימת משתמשים שנכשל להם DM
  if (interaction.customId === 'show_failed_list') {
    const failedUsers = allTracked.docs.filter(doc => doc.data().dmFailed);
    if (!failedUsers.length) {
      return interaction.reply({ content: 'אין משתמשים שנכשל DM אליהם.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('❌ משתמשים שנכשל DM אליהם')
      .setDescription(failedUsers.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0xff0000);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 💬 רשימת מי שהגיב ל-DM
  if (interaction.customId === 'show_replied_list') {
    const replied = allTracked.docs.filter(doc => doc.data().replied);
    if (!replied.length) {
      return interaction.reply({ content: 'אף אחד לא ענה ל־DM עדיין.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('💬 משתמשים שהגיבו ל־DM')
      .setDescription(replied.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0x00cc99);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 🛑 בעיטת משתמשים חסומים ולא פעילים
  if (interaction.customId === 'kick_failed_users') {
    await interaction.deferReply({ ephemeral: true });

    const now = Date.now();
    let count = 0;
    let notInGuild = [];
    let failedKick = [];

    const eligibleToKick = allTracked.docs.filter(doc => {
      const d = doc.data();
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      return (
        daysInactive > INACTIVITY_DAYS &&
        d.dmFailed === true &&
        d.replied !== true &&
        (d.reminderCount || 0) >= 1
      );
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
        await member.kick('לא פעיל + חסום DM + לא הגיב');
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

    return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לצוות.', ephemeral: true });
  }

  // ברירת מחדל — לא הופעל כפתור מטופל
  return false;
}

module.exports = { handleMemberButtons };

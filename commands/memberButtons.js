const db = require('../utils/firebase');
const smartChat = require('../handlers/smartChat');

const STAFF_CHANNEL_ID = '881445829100060723';
const INACTIVITY_DAYS = 30;

async function handleMemberButtons(interaction, client) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId;

  // 🔘 שליחה מחדש למשתמש יחיד
  if (id.startsWith('send_dm_again_')) {
    const userId = id.replace('send_dm_again_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת חביבה עבור משתמש שטרם היה פעיל.`;
      const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      await db.collection('memberTracking').doc(userId).set({
        dmSent: true,
        dmSentAt: new Date().toISOString(),
        reminderCount: 1
      }, { merge: true });
      await interaction.reply({ content: `✅ נשלחה תזכורת ל־<@${userId}>`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `❌ לא ניתן לשלוח ל־<@${userId}>: ${err.message}`, ephemeral: true });
    }
    return true;
  }

  // 🔴 שליחה סופית למשתמש יחיד
  if (id.startsWith('send_final_dm_')) {
    const userId = id.replace('send_final_dm_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת אחרונה ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
      const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      await db.collection('memberTracking').doc(userId).set({
        reminderCount: 3,
        dmSentAt: new Date().toISOString()
      }, { merge: true });
      await interaction.reply({ content: `📨 נשלחה תזכורת סופית ל־<@${userId}>`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `❌ שגיאה בשליחה ל־<@${userId}>: ${err.message}`, ephemeral: true });
    }
    return true;
  }

  // 🔘 שליחה קבוצתית ראשונה
  if (id === 'send_dm_batch_list') {
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await client.channels.fetch(STAFF_CHANNEL_ID);

    let count = 0;
    let failed = [];

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      if (daysInactive > INACTIVITY_DAYS && !d.dmSent && members.has(userId)) {
        try {
          const user = await client.users.fetch(userId).catch(() => null);
          if (!user || !user.id) throw new Error('User not found');
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. כתוב תזכורת נעימה למשתמש לא פעיל חודש.`;
          const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);

          await db.collection('memberTracking').doc(userId).set({
            dmSent: true,
            dmSentAt: new Date().toISOString(),
            reminderCount: 1
          }, { merge: true });

          if (staff?.isTextBased()) {
            await staff.send(`📨 נשלחה תזכורת ל־<@${userId}>`);
          }
          count++;
        } catch (err) {
          failed.push(`<@${userId}>`);
        }
      }
    }

    let msg = `✅ נשלחו תזכורות ל־${count} משתמשים.`;
    if (failed.length > 0) msg += `\n❌ נכשלו (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }

  // 🔴 שליחה קבוצתית סופית
  if (id === 'send_dm_batch_final_check') {
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await client.channels.fetch(STAFF_CHANNEL_ID);

    let count = 0;
    let failed = [];

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      if (daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && members.has(userId)) {
        try {
          const user = await client.users.fetch(userId).catch(() => null);
          if (!user || !user.id) throw new Error('User not found');
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת סופית ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
          const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);

          await db.collection('memberTracking').doc(userId).set({
            reminderCount: 3,
            dmSentAt: new Date().toISOString()
          }, { merge: true });

          if (staff?.isTextBased()) {
            await staff.send(`📨 נשלחה תזכורת סופית ל־<@${userId}>`);
          }
          count++;
        } catch (err) {
          failed.push(`<@${userId}>`);
        }
      }
    }

    let msg = `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`;
    if (failed.length > 0) msg += `\n❌ נכשלו (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }

  return false; // לא כפתור שלנו
}

module.exports = { handleMemberButtons };

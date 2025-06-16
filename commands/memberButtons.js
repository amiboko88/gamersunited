const db = require('../utils/firebase');

/**
 * כפתורים לשליחת הודעות DM קבוצתיות/ספציפיות עבור memberTracker / inactivity
 */
async function handleMemberButtons(interaction, client) {
  const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
  const INACTIVITY_DAYS = 30;

  // שליחה יחידנית — DM ראשון
  if (interaction.customId.startsWith('send_dm_again_')) {
    const userId = interaction.customId.replace('send_dm_again_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת חביבה עבור משתמש שטרם היה פעיל.`;
      const smartChat = require('../handlers/smartChat');
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

  // שליחה יחידנית — DM אחרון
  if (interaction.customId.startsWith('send_final_dm_')) {
    const userId = interaction.customId.replace('send_final_dm_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת אחרונה ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
      const smartChat = require('../handlers/smartChat');
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

  // שליחה קבוצתית — ראשונה
  if (interaction.customId === 'send_dm_batch_list') {
    await interaction.deferReply({ ephemeral: true });

    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await client.channels.fetch(STAFF_CHANNEL_ID);

    let count = 0;
    let failed = [];
    let notInGuild = [];

    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;

      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      // בדיקה: המשתמש קיים בשרת? (אם לא — מסמן)
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }
      // בדיקה: המשתמש עונה על תנאי חוסר פעילות
      if (!(daysInactive > INACTIVITY_DAYS && !d.dmSent)) {
        continue;
      }

      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !user.id) throw new Error('User not found');
        try {
          const smartChat = require('../handlers/smartChat');
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
        } catch (dmErr) {
          failed.push(`<@${userId}>`);
        }
      } catch (err) {
        failed.push(`<@${userId}>`);
      }
    }

    let msg = `✅ נשלחו תזכורות ל־${count} משתמשים.`;
    if (notInGuild.length > 0) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length > 0) msg += `\n❌ נכשלו DM (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }

  // שליחה קבוצתית — סופית
  if (interaction.customId === 'send_dm_batch_final_check') {
    await interaction.deferReply({ ephemeral: true });

    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await client.channels.fetch(STAFF_CHANNEL_ID);

    let count = 0;
    let failed = [];
    let notInGuild = [];

    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;

      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      // קבוצה: רק מי שקיבל ולא ענה
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }
      if (!(daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied)) {
        continue;
      }

      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !user.id) throw new Error('User not found');
        try {
          const smartChat = require('../handlers/smartChat');
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
        } catch (dmErr) {
          failed.push(`<@${userId}>`);
        }
      } catch (err) {
        failed.push(`<@${userId}>`);
      }
    }

    let msg = `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`;
    if (notInGuild.length > 0) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length > 0) msg += `\n❌ נכשלו DM (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });
    return true;
  }

  // לא כפתור שלנו? להתעלם.
  return false;
}

module.exports = { handleMemberButtons };

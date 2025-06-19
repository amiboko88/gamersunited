// 📁 handlers/inactivityReminder.js
const db = require('../utils/firebase');

const VERIFIED_ROLE_ID = '1120787309432938607';
const STAFF_CHANNEL_ID = '881445829100060723';

async function startInactivityReminder(client) {
  setInterval(async () => {
    console.log('[📬] סריקת משתמשים לא פעילים מעל 3 ימים...');

    const now = Date.now();
    const threshold = now - (3 * 24 * 60 * 60 * 1000); // 72 שעות אחורה

    const snapshot = await db.collection('memberTracking')
      .where('status', '==', 'active')
      .where('dmSent', '==', false)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const userId = doc.id;
      const last = new Date(data.lastActivity || data.joinedAt || 0).getTime();

      if (last > threshold) continue; // לא עברו 72 שעות

      const guild = client.guilds.cache.get(data.guildId);
      if (!guild) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      // 🔒 בדיקת Role – האם עדיין מאומת?
      if (!member.roles.cache.has(VERIFIED_ROLE_ID)) {
        console.log(`🔕 ${userId} כבר לא מאומת – מדלגים`);
        continue;
      }

try {
  await member.send(
    '👋 היי! שמנו לב שעברת אימות אבל עדיין לא התחלת להשתתף.\n\n' +
    'אם משהו לא הסתדר או יש לך שאלה – תכתוב לי כאן. 💬'
  );

  await doc.ref.set({
    dmSent: true,
    dmSentAt: new Date().toISOString()
  }, { merge: true });

  console.log(`📩 נשלח DM ל־${member.user.username || userId}`);

  const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
  if (staffChannel?.isTextBased()) {
    staffChannel.send(`📬 <@${userId}> קיבל תזכורת לאחר 3 ימים של אי־פעילות.`);
  }

} catch (err) {
  console.warn(`⚠️ לא ניתן לשלוח DM ל־${userId}: ${err.message}`);

  await doc.ref.set({ dmSent: true, dmFailed: true }, { merge: true });

  const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
  if (staffChannel?.isTextBased()) {
    staffChannel.send(`❌ לא ניתן לשלוח תזכורת ל־<@${userId}> לאחר 3 ימים.`);
    const { sendFallbackButton } = require('./dmFallbackModal');
    staffChannel.send({
      content: `<@${userId}> תוכל להגיב גם כאן במקום ב־DM:`,
      components: sendFallbackButton(userId).components
    });
  }
}

    }

  }, 1000 * 60 * 60 * 6); // כל 6 שעות
}

module.exports = { startInactivityReminder };

// 📁 handlers/memberTracker.js
const db = require('../utils/firebase');

function setupMemberTracker(client) {
  // 🟢 בעת הצטרפות משתמש
  client.on('guildMemberAdd', async member => {
    await db.collection('memberTracking').doc(member.id).set({
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      dmSent: false,
      dmFailed: false,
      replied: false,
    }, { merge: true });
  });

  // 🟡 בעת שליחת הודעה
  client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    await db.collection('memberTracking').doc(message.author.id).set({
      lastActivity: new Date().toISOString(),
    }, { merge: true });
  });

  console.log('✅ ניטור משתמשים לא פעילים הופעל');
}

module.exports = { setupMemberTracker };

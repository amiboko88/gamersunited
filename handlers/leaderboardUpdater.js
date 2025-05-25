// 📁 handlers/leaderboardUpdater.js
const cron = require('node-cron');
const { sendLeaderboardEmbed } = require('./leaderboardDisplay');
const db = require('../utils/firebase');

function startLeaderboardUpdater(client) {
  cron.schedule('0 20 * * 6', async () => {
    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection('systemTasks').doc('weekly');
    const doc = await docRef.get();
    if (doc.exists && doc.data().lastLeaderboardSent === today) {
      console.log('⏭️ Leaderboard כבר נשלח היום.');
      return;
    }

    try {
      console.log('📊 מריץ Leaderboard שבועי...');
      await sendLeaderboardEmbed(client);
      await docRef.set({ lastLeaderboardSent: today }, { merge: true });
    } catch (err) {
      console.error('❌ שגיאה ב־Leaderboard השבועי:', err);
    }
  });
}

module.exports = { startLeaderboardUpdater };

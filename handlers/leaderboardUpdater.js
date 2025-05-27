// 📁 handlers/leaderboardUpdater.js

const cron = require('node-cron');
const { sendLeaderboardEmbed } = require('./leaderboardDisplay');
const db = require('../utils/firebase');

/**
 * מתזמן את שליחת לוח הפעילות השבועי – כל שבת ב־20:00
 */
function startLeaderboardUpdater(client) {
  cron.schedule('0 20 * * 6', async () => {
    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection('systemTasks').doc('weekly');

    try {
      // בדיקה אם כבר נשלח היום
      const doc = await docRef.get();
      if (doc.exists && doc.data().lastLeaderboardSent === today) {
        console.log('⏭️ לוח הפעילות כבר נשלח היום.');
        return;
      }

      if (!client?.guilds) {
        console.warn('⚠️ הבוט לא מחובר ל־Discord. לא ניתן לשלוח Leaderboard.');
        return;
      }

      console.log('📊 שולח את לוח הפעילות השבועי...');
      const success = await sendLeaderboardEmbed(client);

      if (success) {
        await docRef.set({ lastLeaderboardSent: today }, { merge: true });
        console.log('✅ לוח הפעילות עודכן ונשלח בהצלחה.');
      } else {
        console.warn('ℹ️ לא נשלח לוח – ייתכן ואין משתמשים פעילים.');
      }

    } catch (err) {
      console.error('❌ שגיאה בשליחת לוח הפעילות השבועי:', err);
    }
  });
}

module.exports = { startLeaderboardUpdater };

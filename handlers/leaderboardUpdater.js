// 📁 handlers/leaderboardUpdater.js
const { sendLeaderboardEmbed } = require('./leaderboardDisplay');
const db = require('../utils/firebase');

/**
 * בודק אם יש צורך ומפעיל את שליחת לוח הפעילות השבועי.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function updateWeeklyLeaderboard(client) {
  const now = new Date();
  console.log(`⏰ בודק שליחת Leaderboard – תאריך מקומי: ${now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);

  const today = now.toISOString().split('T')[0];
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
}

module.exports = { updateWeeklyLeaderboard };
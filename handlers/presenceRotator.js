// 📁 handlers/presenceRotator.js
const { ActivityType } = require('discord.js');

const statuses = [
  { type: ActivityType.Playing, text: 'פיפו עם קרציות 👀' },
  { type: ActivityType.Watching, text: 'מחכה ל-MVP 🏆' },
  { type: ActivityType.Playing, text: 'וורזון – תתחילו כבר 🎮' },
  { type: ActivityType.Playing, text: 'AFK אבל קולט הכל 🕵️‍♂️' },
  { type: ActivityType.Listening, text: 'GG? מי אמר GG? 🎤' },
  { type: ActivityType.Playing, text: 'שקט! ספאם בבוטים 🤫' },
  { type: ActivityType.Playing, text: 'נשואים מתפרקים כאן 💔' },
  { type: ActivityType.Watching, text: 'מי יגיד GG ראשון?' },
  { type: ActivityType.Playing, text: 'ממתין ל־/fifo...' }
];

let currentIndex = 0;

/**
 * מעדכן את הנוכחות (סטטוס) של הבוט לפריט הבא ברשימה.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
function rotatePresence(client) {
  const { type, text } = statuses[currentIndex];
  
  try {
    client.user.setActivity(text, { type });
    // קדם את האינדקס לפעם הבאה, עם חזרה להתחלה בסוף הרשימה
    currentIndex = (currentIndex + 1) % statuses.length;
  } catch (error) {
    console.error('❌ שגיאה בעדכון הנוכחות של הבוט:', error);
  }
}

module.exports = { rotatePresence };
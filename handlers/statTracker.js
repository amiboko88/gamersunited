// 📁 handlers/statTracker.js
const db = require('../utils/firebase');
const admin = require('firebase-admin');

// 🧐 עדכון חכם לערכים סטטיסטיים
async function incrementStat(userId, field, amount = 1) {
  const ref = db.collection('userStats').doc(userId);
  await ref.set({ [field]: amount }, { merge: true });
  await ref.update({ [field]: admin.firestore.FieldValue.increment(amount) });
}

async function setStat(userId, field, value) {
  const ref = db.collection('userStats').doc(userId);
  await ref.set({ [field]: value }, { merge: true });
}

// 🤓 פונקציית חישוב ממוצע מדויק
function calcNewAverage(currentAvg, totalCount, newValue) {
  return parseFloat(((currentAvg * (totalCount - 1) + newValue) / totalCount).toFixed(2));
}

// 📊 הודעות טקסט
module.exports.trackMessage = async message => {
  if (!message.author || message.author.bot) return;
  const userId = message.author.id;

  await incrementStat(userId, 'messagesSent');

  // חישוב ממוצע מילים
  const words = message.content.trim().split(/\s+/).length;
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const stats = doc.exists ? doc.data() : {};
  const currentAvg = stats.avgWordsPerMessage || 0;
  const messages = stats.messagesSent || 1;
  const newAvg = calcNewAverage(currentAvg, messages, words);
  await setStat(userId, 'avgWordsPerMessage', newAvg);

  // בדיקת מדיה
  if (message.attachments.size > 0) await incrementStat(userId, 'mediaShared');
  if (message.content.includes('http') || message.content.includes('www.')) {
    await incrementStat(userId, 'linksShared');
  }
};

// 📊 
module.exports.trackSlash = async interaction => {
  if (!interaction.user || interaction.user.bot) return;
  await incrementStat(interaction.user.id, 'slashUsed');
};

// 📊 שימוש בלוח סאונד
module.exports.trackSoundUse = async userId => {
  await incrementStat(userId, 'soundsUsed');
};

// 📊 תגובה חכמה מהבוט
module.exports.trackSmartReply = async userId => {
  await incrementStat(userId, 'smartReplies');
};

// 📊 לחיצה על כפתור RSVP
module.exports.trackRsvp = async userId => {
  await incrementStat(userId, 'rsvpCount');
};

// 📊 דקות בערוץ קול
module.exports.trackVoiceMinutes = async (userId, minutes) => {
  await incrementStat(userId, 'voiceMinutes', minutes);
};

// 📊 ספירת כניסות לערוץ קול
module.exports.trackJoinCount = async userId => {
  await incrementStat(userId, 'timesJoinedVoice');
};

// 📊 חישוב ממוצע זמן שהייה בקול
module.exports.trackJoinDuration = async (userId, durationMinutes) => {
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const current = doc.data();
  const totalSessions = current?.timesJoinedVoice || 1;
  const existingAvg = current?.averageJoinDuration || durationMinutes;
  const newAvg = calcNewAverage(existingAvg, totalSessions, durationMinutes);
  await setStat(userId, 'averageJoinDuration', newAvg);
};

// 📊 ספירת השתקות (לקרציות או TTS)
module.exports.trackMuted = async userId => {
  await incrementStat(userId, 'mutedCount');
};

// 📊 שינוי כינוי
module.exports.trackNicknameChange = async userId => {
  await incrementStat(userId, 'nicknameChanges');
};

// 📊 שעת פעילות אחרונה
module.exports.trackActiveHour = async userId => {
  const hour = new Date().getHours();
  await setStat(userId, 'mostActiveHour', hour);
};

// 📊 פודקאסט FIFO
module.exports.trackPodcast = async userId => {
  await incrementStat(userId, 'podcastAppearances');
};

// 📊 סטטיסטיקות לפי משחק
async function updateGameStats(userId, gameName, minutes, db) {
  if (!gameName) return;
  const ref = db.collection('gameStats').doc(userId);
  const doc = await ref.get();
  const current = doc.exists ? doc.data() : {};
  const existing = current[gameName]?.minutes || 0;
  await ref.set({
    [gameName]: { minutes: existing + minutes }
  }, { merge: true });
}

module.exports.updateGameStats = updateGameStats;

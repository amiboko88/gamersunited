// 📁 handlers/statTracker.js
const db = require('../utils/firebase');
const admin = require('firebase-admin');

// 🧠 פונקציה כללית להוספת ערך למשתמש
async function incrementStat(userId, field, amount = 1) {
  const ref = db.collection('activityStats').doc(userId);
  await ref.set({ [field]: amount }, { merge: true });
  await ref.update({ [field]: admin.firestore.FieldValue.increment(amount) });
}

// 🧠 פונקציה כללית לעדכון ערך ישיר
async function setStat(userId, field, value) {
  const ref = db.collection('activityStats').doc(userId);
  await ref.set({ [field]: value }, { merge: true });
}

// 📊 סטטיסטיקות בסיסיות
module.exports.trackMessage = async message => {
  if (!message.author || message.author.bot) return;
  const userId = message.author.id;
  await incrementStat(userId, 'messagesSent');

  // מילים ממוצעות
  const words = message.content.trim().split(/\s+/).length;
  const ref = db.collection('activityStats').doc(userId);
  const doc = await ref.get();
  const currentAvg = doc.data()?.avgWordsPerMessage || 0;
  const messages = doc.data()?.messagesSent || 1;
  const newAvg = ((currentAvg * (messages - 1)) + words) / messages;
  await setStat(userId, 'avgWordsPerMessage', parseFloat(newAvg.toFixed(2)));

  // מדיה וקישורים
  if (message.attachments.size > 0) await incrementStat(userId, 'mediaShared');
  if (message.content.includes('http') || message.content.includes('www.')) {
    await incrementStat(userId, 'linksShared');
  }
};

module.exports.trackSlash = async interaction => {
  if (!interaction.user || interaction.user.bot) return;
  await incrementStat(interaction.user.id, 'slashUsed');
};

module.exports.trackSoundUse = async userId => {
  await incrementStat(userId, 'soundsUsed');
};

module.exports.trackSmartReply = async userId => {
  await incrementStat(userId, 'smartReplies');
};

module.exports.trackRsvp = async userId => {
  await incrementStat(userId, 'rsvpCount');
};

module.exports.trackVoiceMinutes = async (userId, minutes) => {
  await incrementStat(userId, 'voiceMinutes', minutes);
};

module.exports.trackJoinCount = async userId => {
  await incrementStat(userId, 'timesJoinedVoice');
};

module.exports.trackJoinDuration = async (userId, durationMinutes) => {
  const ref = db.collection('activityStats').doc(userId);
  const doc = await ref.get();
  const current = doc.data();
  const totalSessions = current?.timesJoinedVoice || 1;
  const existingAvg = current?.averageJoinDuration || durationMinutes;
  const newAvg = ((existingAvg * (totalSessions - 1)) + durationMinutes) / totalSessions;
  await setStat(userId, 'averageJoinDuration', parseFloat(newAvg.toFixed(1)));
};

module.exports.trackMuted = async userId => {
  await incrementStat(userId, 'mutedCount');
};

module.exports.trackNicknameChange = async userId => {
  await incrementStat(userId, 'nicknameChanges');
};

// 🕐 תובנה: שעת פעילות
module.exports.trackActiveHour = async userId => {
  const hour = new Date().getHours();
  const ref = db.collection('activityStats').doc(userId);
  await setStat(userId, 'mostActiveHour', hour);
};

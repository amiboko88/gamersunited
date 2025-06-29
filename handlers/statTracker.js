// 📁 handlers/statTracker.js
const db = require('../utils/firebase');
const admin = require('firebase-admin');

// 🎚️ טבלת משקלים לכל פעולה לצבירת XP
const xpWeights = {
  messagesSent: 2,
  slashUsed: 3,
  soundsUsed: 2,
  smartReplies: 4,
  rsvpCount: 1,
  voiceMinutes: 1,
  timesJoinedVoice: 2,
  mutedCount: 1,
  nicknameChanges: 1,
  podcastAppearances: 5,
  mediaShared: 2,
  linksShared: 2
};

// 🎯 משקל חכם
function getXpReward(field, amount = 1) {
  return (xpWeights[field] || 1) * amount;
}

// 🧠 עדכון חכם לסטטיסטיקות ו־XP
async function incrementStat(userId, field, amount = 1) {
  const userRef = db.collection('userStats').doc(userId);
  const weekRef = db.collection('weeklyStats').doc(userId);
  const incrementObj = { [field]: admin.firestore.FieldValue.increment(amount) };

  // ודא קיום המסמך
  await Promise.all([
    userRef.set({}, { merge: true }),
    weekRef.set({}, { merge: true })
  ]);

  // עדכון ערך סטטיסטי
  await Promise.all([
    userRef.update(incrementObj),
    weekRef.update(incrementObj)
  ]);

  // עדכון XP
  const xp = getXpReward(field, amount);
  await Promise.all([
    userRef.update({ xpGained: admin.firestore.FieldValue.increment(xp) }),
    weekRef.update({ xpThisWeek: admin.firestore.FieldValue.increment(xp) })
  ]);
}

// 🔧 עדכון ישיר לשדה
async function setStat(userId, field, value) {
  const userRef = db.collection('userStats').doc(userId);
  await userRef.set({ [field]: value }, { merge: true });
}

// 📊 חישוב ממוצע מדויק
function calcNewAverage(currentAvg, totalCount, newValue) {
  return parseFloat(((currentAvg * (totalCount - 1) + newValue) / totalCount).toFixed(2));
}
// 📩 הודעות טקסט
module.exports.trackMessage = async message => {
  if (!message.author || message.author.bot) return;
  const userId = message.author.id;

  await incrementStat(userId, 'messagesSent');

  // עדכון פעילות כללית
  await db.collection('memberTracking').doc(userId).set({
    lastActivity: new Date().toISOString(),
    activityWeight: admin.firestore.FieldValue.increment(1)
  }, { merge: true });

  // ממוצע מילים להודעה
  const words = message.content.trim().split(/\s+/).length;
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const stats = doc.exists ? doc.data() : {};
  const currentAvg = stats.avgWordsPerMessage || 0;
  const messages = (stats.messagesSent || 0) + 1;
  const newAvg = calcNewAverage(currentAvg, messages, words);
  await setStat(userId, 'avgWordsPerMessage', newAvg);

  if (message.attachments.size > 0) await incrementStat(userId, 'mediaShared');
  if (message.content.includes('http') || message.content.includes('www.')) {
    await incrementStat(userId, 'linksShared');
  }
};

// 🟢 Slash commands
module.exports.trackSlash = async interaction => {
  if (!interaction.user || interaction.user.bot) return;
  await incrementStat(interaction.user.id, 'slashUsed');
};

// 🔊 שימוש בסאונד
module.exports.trackSoundUse = async userId => {
  await incrementStat(userId, 'soundsUsed');
};

// 🤖 תגובות בוט חכמות
module.exports.trackSmartReply = async userId => {
  await incrementStat(userId, 'smartReplies');
};

// 📅 RSVP
module.exports.trackRsvp = async userId => {
  await incrementStat(userId, 'rsvpCount');
};

// 🗣️ דקות קול
module.exports.trackVoiceMinutes = async (userId, minutes) => {
  await incrementStat(userId, 'voiceMinutes', minutes);
};

// 🔁 כניסות לערוץ קול
module.exports.trackJoinCount = async userId => {
  await incrementStat(userId, 'timesJoinedVoice');
};

// 🧮 חישוב ממוצע זמן שהייה
module.exports.trackJoinDuration = async (userId, durationMinutes) => {
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const data = doc.exists ? doc.data() : {};
  const totalSessions = (data.timesJoinedVoice || 0) + 1;
  const currentAvg = data.averageJoinDuration || durationMinutes;
  const newAvg = calcNewAverage(currentAvg, totalSessions, durationMinutes);
  await setStat(userId, 'averageJoinDuration', newAvg);
};

// 🔇 השתקות
module.exports.trackMuted = async userId => {
  await incrementStat(userId, 'mutedCount');
};

// 🧑 שינוי כינוי
module.exports.trackNicknameChange = async userId => {
  await incrementStat(userId, 'nicknameChanges');
};

// ⏰ עדכון שעת פעילות
module.exports.trackActiveHour = async userId => {
  const hour = new Date().getHours();
  await setStat(userId, 'mostActiveHour', hour);
};

// 🎙️ השתתפות בפודקאסט
module.exports.trackPodcast = async userId => {
  await incrementStat(userId, 'podcastAppearances');
};

// 🎮 נתוני זמן לפי משחק
async function updateGameStats(userId, gameName, minutes, db) {
  try {
    if (!gameName) return;
    const ref = db.collection('gameStats').doc(userId);
    const doc = await ref.get();
    const current = doc.exists ? doc.data() : {};
    const existing = (current?.[gameName] && current[gameName].minutes) || 0;
    await ref.set({
      [gameName]: { minutes: existing + minutes }
    }, { merge: true });
  } catch (err) {
    console.warn(`⚠️ updateGameStats נכשל עבור ${userId}: ${err.message}`);
  }
}
module.exports.updateGameStats = updateGameStats;

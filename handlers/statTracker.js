// 📁 handlers/statTracker.js
const db = require('../utils/firebase');
const admin = require('firebase-admin');

function getXpReward(field, amount = 1) {
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
  return (xpWeights[field] || 1) * amount;
}

async function incrementStat(userId, field, amount = 1) {
  const userRef = db.collection('userStats').doc(userId);
  const weekRef = db.collection('weeklyStats').doc(userId);

  // ערך שצריך להתעדכן
  const incrementObj = { [field]: admin.firestore.FieldValue.increment(amount) };

  // עדכון במסמך total
  await userRef.set({ [field]: amount }, { merge: true });
  await userRef.update(incrementObj);

  // עדכון במסמך weekly
  await weekRef.set({ [field]: amount }, { merge: true });
  await weekRef.update(incrementObj);

  // תוספת XP
  const xp = getXpReward(field, amount);
  await userRef.update({ xpGained: admin.firestore.FieldValue.increment(xp) });
  await weekRef.update({ xpThisWeek: admin.firestore.FieldValue.increment(xp) });
}

async function setStat(userId, field, value) {
  const userRef = db.collection('userStats').doc(userId);
  await userRef.set({ [field]: value }, { merge: true });
}

// 🎯 חישוב ממוצע
function calcNewAverage(currentAvg, totalCount, newValue) {
  return parseFloat(((currentAvg * (totalCount - 1) + newValue) / totalCount).toFixed(2));
}

// 📊 הודעות טקסט
module.exports.trackMessage = async message => {
  if (!message.author || message.author.bot) return;
  const userId = message.author.id;

  await incrementStat(userId, 'messagesSent');

  await db.collection('memberTracking').doc(userId).set({
    lastActivity: new Date().toISOString(),
    activityWeight: admin.firestore.FieldValue.increment(1)
  }, { merge: true });

  const words = message.content.trim().split(/\s+/).length;
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const stats = doc.exists ? doc.data() : {};
  const currentAvg = stats.avgWordsPerMessage || 0;
  const messages = stats.messagesSent || 1;
  const newAvg = calcNewAverage(currentAvg, messages, words);
  await setStat(userId, 'avgWordsPerMessage', newAvg);

  if (message.attachments.size > 0) await incrementStat(userId, 'mediaShared');
  if (message.content.includes('http') || message.content.includes('www.')) {
    await incrementStat(userId, 'linksShared');
  }
};

// 📊 Slash
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
  const ref = db.collection('userStats').doc(userId);
  const doc = await ref.get();
  const current = doc.data();
  const totalSessions = current?.timesJoinedVoice || 1;
  const existingAvg = current?.averageJoinDuration || durationMinutes;
  const newAvg = calcNewAverage(existingAvg, totalSessions, durationMinutes);
  await setStat(userId, 'averageJoinDuration', newAvg);
};

module.exports.trackMuted = async userId => {
  await incrementStat(userId, 'mutedCount');
};

module.exports.trackNicknameChange = async userId => {
  await incrementStat(userId, 'nicknameChanges');
};

module.exports.trackActiveHour = async userId => {
  const hour = new Date().getHours();
  await setStat(userId, 'mostActiveHour', hour);
};

module.exports.trackPodcast = async userId => {
  await incrementStat(userId, 'podcastAppearances');
};

// 🎮 משחקים
async function updateGameStats(userId, gameName, minutes, db) {
  try {
    if (!gameName) return;
    const ref = db.collection('gameStats').doc(userId);
    const doc = await ref.get();
    const current = doc.exists ? doc.data() : {};
    const existing = current[gameName]?.minutes || 0;
    await ref.set({
      [gameName]: { minutes: existing + minutes }
    }, { merge: true });
  } catch (err) {
    console.warn(`⚠️ updateGameStats נכשל עבור ${userId}: ${err.message}`);
  }
}
module.exports.updateGameStats = updateGameStats;

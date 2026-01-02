// 📁 handlers/statTracker.js (מעודכן ל-Unified DB)
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { getUserRef } = require('../utils/userUtils'); // שימוש בתשתית החדשה

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

// 🧠 עדכון חכם לסטטיסטיקות ו־XP - ישירות למאגר המאוחד
async function incrementStat(userId, field, amount = 1) {
  try {
      // שימוש בפונקציית העזר כדי לקבל את המיקום הנכון ב-users
      const userRef = await getUserRef(userId, 'discord');
      const weekRef = db.collection('weeklyStats').doc(userId); // זה נשאר נפרד, וזה בסדר

      // עדכון הסטטיסטיקה הגלובלית בתוך האובייקט stats
      const updates = {
          [`stats.${field}`]: admin.firestore.FieldValue.increment(amount),
          'meta.lastSeen': new Date().toISOString()
      };

      // חישוב ועדכון XP באותו הזמן (בתוך economy)
      const xpToAdd = getXpReward(field, amount);
      if (xpToAdd > 0) {
          updates['economy.xp'] = admin.firestore.FieldValue.increment(xpToAdd);
      }

      await Promise.all([
          userRef.set(updates, { merge: true }),
          weekRef.set({ [field]: admin.firestore.FieldValue.increment(amount) }, { merge: true })
      ]);

  } catch (error) {
      console.error(`❌ שגיאה בעדכון סטטיסטיקה ל-${userId}:`, error);
  }
}

// 🎤 מעקב דקות קוליות
module.exports.trackVoiceMinutes = async (userId, minutes) => {
  await incrementStat(userId, 'voiceMinutes', minutes);
};

// 💬 מעקב הודעות
module.exports.trackMessage = async userId => {
  await incrementStat(userId, 'messagesSent');
};

// 🤖 מעקב פקודות
module.exports.trackCommand = async userId => {
  await incrementStat(userId, 'slashUsed');
};

// 🔊 מעקב סאונדבורד
module.exports.trackSoundUse = async userId => {
  await incrementStat(userId, 'soundsUsed');
};

// 🚪 מעקב כניסות לחדר
module.exports.trackJoinCount = async userId => {
  await incrementStat(userId, 'timesJoinedVoice');
};

// ⌛ ממוצע זמן בחדר
module.exports.trackJoinDuration = async (userId, durationMinutes) => {
  try {
      const userRef = await getUserRef(userId, 'discord');
      const doc = await userRef.get();
      
      const stats = doc.data()?.stats || {};
      const totalSessions = (stats.timesJoinedVoice || 0); 
      
      const currentAvg = stats.averageJoinDuration || durationMinutes;
      const newAvg = totalSessions > 0 
          ? ((currentAvg * (totalSessions - 1)) + durationMinutes) / totalSessions 
          : durationMinutes;

      await userRef.update({
          'stats.averageJoinDuration': Math.round(newAvg * 10) / 10 
      });
  } catch (e) { /* התעלמות אם אין מסמך */ }
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
  try {
      const hour = new Date().getHours();
      const userRef = await getUserRef(userId, 'discord');
      await userRef.set({ 'stats.mostActiveHour': hour }, { merge: true });
  } catch (e) {}
};

// 🎙️ השתתפות בפודקאסט
module.exports.trackPodcast = async userId => {
  await incrementStat(userId, 'podcastAppearances');
};

// 🎮 נתוני זמן לפי משחק (נשאר בקולקשן נפרד gameStats - זה תקין)
async function updateGameStats(userId, gameName, minutes) {
  try {
    if (!gameName) return;
    const ref = db.collection('gameStats').doc(userId);
    const safeGameName = gameName.replace(/[\/\.]/g, ''); 
    
    const updateData = {
        [`games.${safeGameName}.minutes`]: admin.firestore.FieldValue.increment(minutes),
        [`games.${safeGameName}.lastPlayed`]: new Date().toISOString()
    };

    await ref.set(updateData, { merge: true });
  } catch (err) {
    console.error(`⚠️ שגיאה בעדכון משחק ${gameName}:`, err.message);
  }
}

module.exports.updateGameStats = updateGameStats;
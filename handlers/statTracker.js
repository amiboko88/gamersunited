// 📁 handlers/statTracker.js
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { getUserRef } = require('../utils/userUtils'); // שימוש בתשתית החדשה

// 🎚️ טבלת משקלים לכל פעולה לצבירת XP
const xpWeights = {
  messagesSent: 2,
  slashUsed: 3,
  soundsUsed: 2,
  smartReplies: 4,
  rsvpCount: 5,
  voiceMinutes: 10, // כל דקה שווה 10 נקודות
  timesJoinedVoice: 5,
  mutedCount: 0,
  nicknameChanges: 0,
  podcastAppearances: 50, // בונוס יפה
  mediaShared: 5,
  linksShared: 2
};

// חישוב XP לפעולה
function getXpReward(field, amount = 1) {
  return (xpWeights[field] || 1) * amount;
}

/**
 * המנוע המרכזי: מעדכן גם את המשתמש הראשי וגם את הטבלה השבועית
 */
async function incrementStat(userId, field, amount = 1) {
  try {
      const xpGained = getXpReward(field, amount);
      
      // 1. עדכון ב-DB המאוחד (תיק משתמש)
      const userRef = await getUserRef(userId, 'discord');
      const userUpdate = {
          [`stats.${field}`]: admin.firestore.FieldValue.increment(amount),
          'economy.xp': admin.firestore.FieldValue.increment(xpGained),
          'meta.lastActive': new Date().toISOString()
      };
      
      // 2. עדכון בטבלה השבועית (עבור ה-MVP וה-Leaderboard)
      const weekRef = db.collection('weeklyStats').doc(userId);
      const weekUpdate = {
          [field]: admin.firestore.FieldValue.increment(amount),
          xpThisWeek: admin.firestore.FieldValue.increment(xpGained),
          lastActive: new Date().toISOString()
      };

      // ביצוע שני העדכונים במקביל (Promise.all לביצועים מהירים)
      await Promise.all([
          userRef.update(userUpdate).catch(async (e) => {
              // אם המסמך לא קיים, ניצור אותו (Self-Healing)
              if (e.code === 5) { // NOT_FOUND
                  await userRef.set({ 
                      stats: { [field]: amount },
                      economy: { xp: xpGained, level: 1, balance: 0 },
                      meta: { firstSeen: new Date().toISOString() }
                  }, { merge: true });
              } else {
                  console.error(`❌ שגיאה בעדכון משתמש ראשי (${field}):`, e.message);
              }
          }),
          weekRef.set(weekUpdate, { merge: true }) // set עם merge מבטיח יצירה אם לא קיים
      ]);

  } catch (err) {
      console.error(`❌ שגיאה כללית ב-statTracker עבור ${userId}:`, err);
  }
}

// --- פונקציות מעטפת לנוחות (Wrappers) ---

module.exports.trackMessage = async userId => {
  await incrementStat(userId, 'messagesSent');
};

module.exports.trackVoiceMinute = async (userId, minutes = 1) => {
  await incrementStat(userId, 'voiceMinutes', minutes);
};

module.exports.trackVoiceJoin = async userId => {
  await incrementStat(userId, 'timesJoinedVoice');
};

module.exports.trackCommandUse = async userId => {
  await incrementStat(userId, 'slashUsed');
};

module.exports.trackSoundUse = async userId => {
  await incrementStat(userId, 'soundsUsed');
};

module.exports.trackPodcast = async userId => {
  await incrementStat(userId, 'podcastAppearances');
};

module.exports.trackSmartReply = async userId => {
  await incrementStat(userId, 'smartReplies');
};

// 🎮 נתוני זמן לפי משחק (נשאר בקולקשן נפרד gameStats - זה תקין כי זה מידע כבד)
async function updateGameStats(userId, gameName, minutes) {
  try {
    if (!gameName) return;
    const ref = db.collection('gameStats').doc(userId);
    const safeGameName = gameName.replace(/[\/\.]/g, '_'); // ניקוי תווים אסורים

    await ref.set({
      [safeGameName]: {
        minutes: admin.firestore.FieldValue.increment(minutes),
        lastPlayed: new Date().toISOString()
      }
    }, { merge: true });
  } catch (error) {
    console.error(`⚠️ שגיאה בעדכון משחק (${gameName}):`, error.message);
  }
}

module.exports.updateGameStats = updateGameStats;
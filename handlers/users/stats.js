// 📁 handlers/users/stats.js
const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { getUserRef } = require('../../utils/userUtils'); // ✅ DB מאוחד

// 🎚️ טבלת משקלים (XP Weights)
const XP_RATES = {
  message: 2,
  command: 3,
  sound: 2,
  smart_reply: 4,
  voice_minute: 10, // הכי משתלם
  voice_join: 5,
  podcast: 50,      // בונוס ענק
  media: 5
};

class StatTracker {

    /**
     * פונקציה גנרית לעדכון סטטיסטיקה ו-XP
     * @param {string} userId - מזהה המשתמש
     * @param {string} type - סוג הפעולה (message, voice_minute...)
     * @param {string} platform - discord / whatsapp
     * @param {number} amount - כמות (למשל דקות)
     */
    async track(userId, type, platform = 'discord', amount = 1) {
        if (!userId) return;

        const xpReward = (XP_RATES[type] || 1) * amount;
        const fieldName = this.mapTypeToField(type);

        try {
            // 1. עדכון המשתמש הראשי (מצטבר)
            const userRef = await getUserRef(userId, platform);
            
            const updates = {
                [`stats.${fieldName}`]: admin.firestore.FieldValue.increment(amount),
                'economy.xp': admin.firestore.FieldValue.increment(xpReward),
                'meta.lastActive': new Date().toISOString()
            };

            // 2. עדכון טבלה שבועית (עבור Leaderboard/MVP)
            // שים לב: אנחנו שומרים את ה-ID המקורי כמפתח
            const weekRef = db.collection('weeklyStats').doc(userId);
            const weekUpdates = {
                [fieldName]: admin.firestore.FieldValue.increment(amount),
                xpThisWeek: admin.firestore.FieldValue.increment(xpReward),
                platform: platform, // כדי שנדע מאיפה הוא
                lastActive: new Date().toISOString()
            };

            await Promise.all([
                userRef.set(updates, { merge: true }),
                weekRef.set(weekUpdates, { merge: true })
            ]);

        } catch (error) {
            console.error(`❌ [Stats] Error tracking ${type} for ${userId}:`, error.message);
        }
    }

    /**
     * עדכון זמן משחק (לדיסקורד בלבד)
     */
    async trackGameTime(userId, gameName, minutes) {
        if (!gameName) return;
        try {
            const safeGameName = gameName.replace(/[\/\.]/g, '_');
            const ref = db.collection('gameStats').doc(userId);
            
            await ref.set({
                [safeGameName]: {
                    minutes: admin.firestore.FieldValue.increment(minutes),
                    lastPlayed: new Date().toISOString()
                }
            }, { merge: true });
        } catch (e) { console.error('Game Stats Error:', e); }
    }

    // המרת סוג פעולה לשם שדה ב-DB
    mapTypeToField(type) {
        const map = {
            'message': 'messagesSent',
            'command': 'commandsUsed',
            'sound': 'soundsUsed',
            'voice_minute': 'voiceMinutes',
            'voice_join': 'timesJoinedVoice',
            'podcast': 'podcastAppearances'
        };
        return map[type] || 'genericActions';
    }
}

module.exports = new StatTracker();
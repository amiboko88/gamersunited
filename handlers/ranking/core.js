// 📁 handlers/ranking/core.js
const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../../utils/logger');

class RankingCore {
    
    /**
     * מחשב את הניקוד המשוקלל לכל משתמש
     */
    calculateScore(userData) {
        const stats = userData.stats || {};
        const economy = userData.economy || {};
        
        // 🧮 הנוסחה של שמעון 2026:
        // דקה בשיחה = 10 נקודות
        // הודעה בוואטסאפ/דיסקורד = 1 נקודה
        // זכייה בקזינו = בונוס קטן
        
        const voiceScore = (stats.voiceMinutes || 0) * 10;
        const chatScore = (stats.messagesSent || 0) * 1;
        const xpScore = Math.floor((economy.xp || 0) / 100); 

        return {
            total: voiceScore + chatScore + xpScore,
            voice: voiceScore,
            chat: chatScore,
            isGamer: voiceScore > chatScore // האם הוא שחקן אמיתי או סתם קשקשן
        };
    }

    /**
     * שולף את המשתמשים המובילים מהשבוע האחרון
     * (מסתמך על collection 'weeklyStats' שמתאפס כל שבוע)
     */
    async getWeeklyLeaderboard(limit = 7) {
        try {
            const snapshot = await db.collection('weeklyStats')
                .orderBy('xpThisWeek', 'desc')
                .limit(limit)
                .get();

            if (snapshot.empty) return [];

            const leaderboard = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                // שליפת פרטים מלאים מה-users הראשי (בשביל שם ותמונה)
                const userDoc = await db.collection('users').doc(doc.id).get();
                const userData = userDoc.exists ? userDoc.data() : {};

                leaderboard.push({
                    id: doc.id,
                    name: userData.identity?.displayName || userData.username || 'Unknown',
                    avatarUrl: userData.avatarUrl || null,
                    stats: {
                        voiceMinutes: data.voiceMinutes || 0,
                        messages: data.messagesSent || 0,
                        xp: data.xpThisWeek || 0
                    },
                    scoreData: this.calculateScore(userData) // חישוב היחס
                });
            }
            return leaderboard;

        } catch (error) {
            console.error('❌ Ranking Core Error:', error);
            return [];
        }
    }

    /**
     * איפוס שבועי (ירוץ ב-Cron במוצ"ש)
     */
    async resetWeeklyStats() {
        const batch = db.batch();
        const snapshot = await db.collection('weeklyStats').get();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        log('[Ranking] 🔄 הטבלה השבועית אופסה.');
    }
}

module.exports = new RankingCore();
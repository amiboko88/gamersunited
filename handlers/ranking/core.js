// 📁 handlers/ranking/core.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

class RankingCore {

    /**
     * מחשב ושולף את המובילים של השבוע
     * @param {number} limit כמות המשתמשים להצגה (ברירת מחדל 10)
     */
    async getWeeklyLeaderboard(limit = 10) {
        try {
            // 1. שליפת כל הנתונים (Users + GameStats) במקביל
            const [usersSnapshot, gameStatsSnapshot] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get()
            ]);

            // מיפוי מהיר של משחקים
            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            let participants = [];

            // 2. מעבר על כל המשתמשים וחישוב ניקוד
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const userId = doc.id;
                const gameData = gamesMap.get(userId) || {};

                // דילוג על בוטים או חסרי שם
                if (userData.identity?.isBot) return;

                // --- נוסחת הניקוד (The Algorithm) ---
                
                // א. הודעות (2 נקודות להודעה)
                const msgPoints = (userData.stats?.messagesSent || 0) * 2;
                
                // ב. קול (1 נקודה לכל דקה)
                const voicePoints = (userData.stats?.voiceMinutes || 0);

                // ג. משחקים (0.5 נקודה לכל דקת משחק)
                let gameMinutes = 0;
                Object.values(gameData).forEach(game => {
                    // מוודאים שאנחנו קוראים את המבנה החדש והנקי
                    if (game && typeof game.minutes === 'number') {
                        gameMinutes += game.minutes;
                    }
                });
                const gamePoints = Math.floor(gameMinutes * 0.5);

                // ד. XP כללי (בונוס קטן)
                const xpPoints = Math.floor((userData.economy?.xp || 0) / 10);

                const totalScore = msgPoints + voicePoints + gamePoints + xpPoints;

                // אם אין פעילות בכלל - מדלגים
                if (totalScore === 0) return;

                // בניית אובייקט משתמש לטבלה
                participants.push({
                    id: userId,
                    name: userData.identity?.displayName || userData.identity?.fullName || 'Unknown Soldier',
                    avatar: userData.identity?.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    score: totalScore,
                    stats: {
                        msgs: userData.stats?.messagesSent || 0,
                        voice: Math.floor((userData.stats?.voiceMinutes || 0) / 60), // שעות
                        games: Math.floor(gameMinutes / 60) // שעות
                    }
                });
            });

            // 3. מיון וחיתוך
            participants.sort((a, b) => b.score - a.score);
            return participants.slice(0, limit);

        } catch (error) {
            log(`❌ [RankingCore] Error: ${error.message}`);
            return [];
        }
    }
}

module.exports = new RankingCore();
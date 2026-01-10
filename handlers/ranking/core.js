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

            // מיפוי מהיר של משחקים לפי ID משתמש
            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            let participants = [];

            // 2. מעבר על כל המשתמשים וחישוב ניקוד
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const userId = doc.id;
                const gameData = gamesMap.get(userId) || {};

                // --- סינון בסיסי ---
                // א. דילוג על בוטים
                if (userData.identity?.isBot) return;

                // ב. סינון "הצבא המת" - אם השם הוא Unknown ואין לו כמעט XP, הוא לא נכנס לטבלה
                const displayName = userData.identity?.displayName || userData.identity?.fullName;
                if (!displayName || displayName === "Unknown") {
                    // אם הוא Unknown אבל יש לו מעל 100 XP אולי נרצה להציג אותו, אחרת - בחוץ
                    if ((userData.economy?.xp || 0) < 50) return;
                }

                // --- נוסחת הניקוד (The Algorithm) ---
                
                // א. הודעות (2 נקודות להודעה)
                const msgPoints = (userData.stats?.messagesSent || 0) * 2;
                
                // ב. קול (1 נקודה לכל דקת שיחה)
                const voicePoints = (userData.stats?.voiceMinutes || 0);

                // ג. משחקים (0.5 נקודה לכל דקת משחק)
                let gameMinutes = 0;
                Object.values(gameData).forEach(game => {
                    // בדיקה בטוחה: גם אם זה מספר ישיר וגם אם זה אובייקט עם שדה minutes
                    if (typeof game === 'number') {
                        gameMinutes += game;
                    } else if (game && typeof game.minutes === 'number') {
                        gameMinutes += game.minutes;
                    }
                });
                const gamePoints = Math.floor(gameMinutes * 0.5);

                // ד. XP כללי (בונוס קטן: 1 נקודה על כל 10 XP)
                const xpPoints = Math.floor((userData.economy?.xp || 0) / 10);

                const totalScore = msgPoints + voicePoints + gamePoints + xpPoints;

                // אם אין פעילות בכלל השבוע - מדלגים
                if (totalScore === 0) return;

                // בניית אובייקט משתמש לטבלה
                participants.push({
                    id: userId,
                    name: displayName || 'Unknown Soldier',
                    avatar: userData.identity?.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    score: totalScore,
                    stats: {
                        msgs: userData.stats?.messagesSent || 0,
                        voice: Math.floor((userData.stats?.voiceMinutes || 0) / 60), // המרה לשעות לתצוגה
                        games: Math.floor(gameMinutes / 60) // המרה לשעות לתצוגה
                    }
                });
            });

            // 3. מיון לפי ניקוד גבוה וחיתוך לפי המגבלה
            participants.sort((a, b) => b.score - a.score);
            
            log(`📊 [Ranking] חושב דירוג עבור ${participants.length} משתתפים פעילים.`);
            return participants.slice(0, limit);

        } catch (error) {
            log(`❌ [RankingCore] Error: ${error.message}`);
            return [];
        }
    }
}

module.exports = new RankingCore();
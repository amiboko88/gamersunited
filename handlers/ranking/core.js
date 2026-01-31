// 📁 handlers/ranking/core.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

class RankingCore {

    /**
     * מחשב ושולף את המובילים של השבוע (על בסיס הפרש מה-Snapshot)
     * @param {number} limit כמות המשתמשים להצגה (ברירת מחדל 10)
     */
    async getWeeklyLeaderboard(limit = 10, forceLifetime = false) {
        try {
            // 1. שליפת כל הנתונים (Users + GameStats) וצילום תחילת השבוע במקביל
            const [usersSnapshot, gameStatsSnapshot, weeklyMeta] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get(),
                db.collection('system_metadata').doc('weekly_snapshot').get()
            ]);

            const startOfWeekData = weeklyMeta.exists ? weeklyMeta.data().stats : {};

            // מיפוי מהיר של משחקים לפי ID משתמש
            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            let participants = [];
            let calculationMode = 'WEEKLY';

            if (forceLifetime) calculationMode = 'LIFETIME';

            // 2. מעבר על כל המשתמשים וחישוב ניקוד
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const userId = doc.id;
                const gameData = gamesMap.get(userId) || {};
                const startStats = startOfWeekData[userId] || { voice: 0, msgs: 0 };

                // --- סינון בסיסי ---
                // א. דילוג על בוטים
                if (userData.identity?.isBot) return;

                // ב. סינון "הצבא המת" - אם השם הוא Unknown ואין לו כמעט XP, הוא לא נכנס לטבלה
                const displayName = userData.identity?.displayName || userData.identity?.fullName;
                if (!displayName || displayName === "Unknown") {
                    if ((userData.economy?.xp || 0) < 50) return;
                }

                // --- חישוב סטטיסטיקה ---
                let weeklyVoiceMinutes = 0;
                let weeklyMsgsSent = 0;

                if (calculationMode === 'LIFETIME') {
                    // שימוש בנתונים המצטברים
                    weeklyVoiceMinutes = userData.stats?.voiceMinutes || 0;
                    weeklyMsgsSent = userData.stats?.messagesSent || 0;
                } else {
                    // חישוב הפרש (Weekly)
                    const startStats = startOfWeekData[userId] || { voice: 0, msgs: 0 };
                    weeklyVoiceMinutes = Math.max(0, (userData.stats?.voiceMinutes || 0) - (startStats.voice || 0));
                    weeklyMsgsSent = Math.max(0, (userData.stats?.messagesSent || 0) - (startStats.msgs || 0));
                }

                // --- נוסחת הניקוד (The Algorithm 2026) ---

                // א. הודעות (2 נקודות להודעה שבועות)
                const msgPoints = weeklyMsgsSent * 2;

                // ב. קול (10 נקודות לכל דקת שיחה שבועית - נותן משקל כבד לקול כפי שביקשת)
                const voicePoints = weeklyVoiceMinutes * 10;

                // ג. משחקים (מבוטל לבקשתך - 0 נקודות)
                let gameMinutes = 0; // לא נספר בניקוד

                // ד. XP כללי (בונוס קטן מה-Total XP: נקודה אחת לכל 10 XP)
                const xpPoints = Math.floor((userData.economy?.xp || 0) / 10);

                const totalScore = msgPoints + voicePoints + xpPoints;

                // אם אין פעילות בכלל השבוע - מדלגים
                if (totalScore === 0 || (weeklyVoiceMinutes === 0 && weeklyMsgsSent === 0)) return;

                // בניית אובייקט משתמש לטבלה
                participants.push({
                    id: userId,
                    name: displayName || 'Unknown Soldier',
                    avatar: userData.identity?.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    score: totalScore,
                    stats: {
                        msgs: weeklyMsgsSent,
                        voice: (weeklyVoiceMinutes / 60).toFixed(1), // המרה לשעות לתצוגה
                        games: 0 // מבוטל
                    }
                });
            });

            // 3. מיון לפי ניקוד גבוה וחיתוך לפי המגבלה
            participants.sort((a, b) => b.score - a.score);
            const topLeaders = participants.slice(0, limit);

            // 4. העשרת נתונים (תמונות פרופיל עדכניות מדיסקורד)
            // אנחנו עושים את זה רק לטופ 10 כדי לחסוך קריאות API מיותרות בלולאה הראשית
            const { client } = require('../../discord/index');
            if (client) {
                for (const p of topLeaders) {
                    try {
                        // ניסיון ראשון: קאש
                        let user = client.users.cache.get(p.id);
                        if (!user) {
                            // ניסיון שני: שליפה מהירה (כי זה רק 10 אנשים, זה בסדר)
                            user = await client.users.fetch(p.id).catch(() => null);
                        }
                        if (user) {
                            p.avatar = user.displayAvatarURL({ extension: 'png', size: 256 });
                        }
                    } catch (e) {
                        // לא נורא, נשאר עם מה שיש ב-DB או בדיפולט
                    }
                }
            }

            log(`📊 [Ranking] חושב דירוג (${calculationMode}) עבור ${participants.length} משתתפים.`);
            return topLeaders;

        } catch (error) {
            log(`❌ [RankingCore] Error: ${error.message}`);
            return [];
        }
    }

    async resetWeeklyStats() {
        try {
            const usersSnapshot = await db.collection('users').get();
            const stats = {};
            usersSnapshot.forEach(doc => {
                const data = doc.data();
                stats[doc.id] = {
                    voice: data.stats?.voiceMinutes || 0,
                    msgs: data.stats?.messagesSent || 0
                };
            });
            await db.collection('system_metadata').doc('weekly_snapshot').set({
                lastReset: new Date().toISOString(),
                stats: stats
            });
            log('🔄 [Ranking] Weekly statistics snapshot updated.');
        } catch (e) { log(`❌ [Ranking] Reset Error: ${e.message}`); }
    }

    /**
     * שולף את סטטיסטיקת הוורזון (לפי סריקות)
     * @param {number} limit 
     * @param {string} period 'WEEKLY' or 'ALL_TIME'
     */
    async getWarzoneStats(limit = 10, period = 'ALL_TIME') {
        try {
            const usersSnapshot = await db.collection('users').get();
            const players = [];

            // Define Timeframe
            let sinceDate = new Date(0); // Epoch
            if (period === 'WEEKLY') {
                sinceDate = new Date();
                sinceDate.setDate(sinceDate.getDate() - 7);
            }

            // Iterate Users (Parallel Fetch for Speed)
            const promises = usersSnapshot.docs.map(async (userDoc) => {
                const userData = userDoc.data();
                // Filter Bots/Unknowns
                if (userData.identity?.isBot) return null;

                // Fetch Games
                const gamesRef = userDoc.ref.collection('games');
                const gamesSnap = await gamesRef.where('timestamp', '>=', sinceDate).get();

                if (gamesSnap.empty) return null;

                let kills = 0;
                let damage = 0;
                let matches = 0;

                gamesSnap.forEach(g => {
                    const stats = g.data();
                    kills += (stats.kills || 0);
                    damage += (stats.damage || 0);
                    matches++;
                });

                // Calculate Score (Simple: Kills * 100 + Damage / 10) ? 
                // Use pure Kills for sorting as per industry standard for "Best Killer"
                // Or "Score" if available. Let's sort by Kills.

                return {
                    id: userDoc.id,
                    name: userData.identity?.displayName || 'Unknown Soldier',
                    avatar: userData.identity?.avatarURL || userData.identity?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    kills,
                    damage,
                    matches,
                    kdr: matches > 0 ? (kills / matches).toFixed(2) : 0
                };
            });

            const results = await Promise.all(promises);
            const activePlayers = results.filter(p => p !== null);

            // Sort by Kills (Descending)
            activePlayers.sort((a, b) => b.kills - a.kills);

            return activePlayers.slice(0, limit);

        } catch (error) {
            log(`❌ [RankingCore] Warzone Stats Error: ${error.message}`);
            return [];
        }
    }
}

module.exports = new RankingCore();
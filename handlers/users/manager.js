// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

const TIMES = {
    WARNING: 7,
    DANGER: 14,
    KICK: 30
};

const IMMUNE_ROLES_NAMES = ['MVP', 'Server Booster', 'VIP'];

class UserManager {

    async updateLastActive(userId) {
        try {
            await db.collection('users').doc(userId).set({
                meta: { lastActive: new Date().toISOString() },
                tracking: { statusStage: 'active' }
            }, { merge: true });
        } catch (error) {
            log(`❌ [UserManager] עדכון פעילות נכשל: ${error.message}`);
        }
    }

    async getInactivityStats(guild) {
        if (!guild) return null;
        
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;

        const stats = {
            total: 0,        
            humans: 0,       
            active: 0,
            immune: 0, 
            inactive7: [],
            inactive14: [],
            inactive30: [],
            kickCandidates: [],
            newMembers: 0,
            voiceNow: 0,       // כמה מחוברים לקול כרגע
            topActive: []      // רשימת ה-TOP 3
        };

        try {
            // --- שלב 1: משיכת נתונים מוגנת (Anti-Crash) ---
            try {
                // מנסים למשוך בכוח, אבל עוטפים כדי לא להקריס את הבוט
                await guild.members.fetch({ time: 10000, force: true });
            } catch (timeoutError) {
                console.warn(`[UserManager] ⚠️ משיכת משתמשים איטית. משתמש בזיכרון הקיים למניעת קריסה.`);
            }

            // משיכת דאטה מה-DB במקביל
            const [usersSnapshot, gameStatsSnapshot] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get()
            ]);

            // מיפוי לגישה מהירה
            const usersMap = new Map();
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));

            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            // איסוף מועמדים ל-Top Active
            let activityScores = [];

            // --- שלב 2: מעבר על המשתמשים ---
            const allMembers = guild.members.cache; // עובדים עם מה שיש (Cache)
            stats.total = guild.memberCount; // המספר האמיתי מדיסקורד

            allMembers.forEach(member => {
                if (member.user.bot) return;
                
                stats.humans++;
                const userId = member.id;
                const userData = usersMap.get(userId) || {};
                const userGames = gamesMap.get(userId) || {};

                // 1. בדיקת פעילות חיה (Voice)
                const isInVoice = member.voice && member.voice.channelId;
                if (isInVoice) stats.voiceNow++;

                // 2. חישוב זמן אחרון (Deep Scan)
                const lastSeenTime = this.calculateLastSeen(member, userData, userGames);
                const daysInactive = Math.floor((now - lastSeenTime) / msPerDay);

                // חישוב ניקוד לפעילות (לטובת ה-TOP 3)
                // משקל: ימים מאז פעילות (פחות ימים = יותר נקודות) + הודעות + XP
                const xp = userData.economy?.xp || 0;
                const score = (1000 / (daysInactive + 1)) + (xp / 10); 
                activityScores.push({ name: member.displayName, score: score, days: daysInactive });

                // 3. חסינות
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // 4. סיווג
                if (daysInactive < 3) {
                    stats.newMembers++;
                    stats.active++;
                } else if (daysInactive >= TIMES.KICK) {
                    stats.inactive30.push({ userId, days: daysInactive, name: member.displayName });
                    stats.kickCandidates.push({ userId, days: daysInactive, name: member.displayName });
                } else if (daysInactive >= TIMES.DANGER) {
                    stats.inactive14.push({ userId, days: daysInactive, name: member.displayName });
                } else if (daysInactive >= TIMES.WARNING) {
                    stats.inactive7.push({ userId, days: daysInactive, name: member.displayName });
                } else {
                    stats.active++;
                }
            });

            // מיון וחילוף ה-Top 3
            stats.topActive = activityScores
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            return stats;

        } catch (error) {
            log(`❌ [UserManager] שגיאה בחישוב סטטיסטיקה: ${error.message}`);
            return null;
        }
    }

    calculateLastSeen(member, userData, userGames) {
        let timestamps = [];
        if (userData.meta?.lastActive) timestamps.push(new Date(userData.meta.lastActive).getTime());
        if (userData.tracking?.joinedAt) timestamps.push(new Date(userData.tracking.joinedAt).getTime());
        if (userData.identity?.lastWhatsappMessage) timestamps.push(new Date(userData.identity.lastWhatsappMessage).getTime());
        
        if (userGames) {
            Object.values(userGames).forEach(game => {
                if (game.lastPlayed) timestamps.push(new Date(game.lastPlayed).getTime());
            });
        }
        
        timestamps.push(member.joinedTimestamp);
        return Math.max(...timestamps);
    }

    async executeKickBatch(guild, userIds) {
        let kicked = [], failed = [];
        for (const userId of userIds) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.kick('Shimon Automation: Inactivity');
                    kicked.push(member.displayName);
                    await db.collection('users').doc(userId).update({ 
                        'tracking.status': 'kicked',
                        'tracking.kickedAt': new Date().toISOString()
                    });
                }
            } catch (e) { failed.push(userId); }
        }
        return { kicked, failed };
    }
}

module.exports = new UserManager();
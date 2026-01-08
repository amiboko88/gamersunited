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

        // הכנת מבנה הנתונים
        const stats = {
            total: 0,        
            humans: 0,       
            active: 0,
            immune: 0, 
            inactive7: [],
            inactive14: [],
            inactive30: [],
            kickCandidates: [],
            newMembers: 0
        };

        try {
            // 1. משיכת נתונים כבדה (משתמשים + סטטיסטיקות משחק)
            const [allMembers, usersSnapshot, gameStatsSnapshot] = await Promise.all([
                guild.members.fetch({ force: true }), // משתמשים חיים
                db.collection('users').get(),         // דאטה בסיסי
                db.collection('gameStats').get()      // היסטוריית משחקים
            ]);

            stats.total = allMembers.size;

            // מיפוי ה-DB לגישה מהירה
            const usersMap = new Map();
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));

            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            // מעבר על כל חבר בשרת
            allMembers.forEach(member => {
                if (member.user.bot) return; // מתעלמים מבוטים
                
                stats.humans++;
                const userId = member.id;
                const userData = usersMap.get(userId) || {};
                const userGames = gamesMap.get(userId) || {};

                // --- בדיקה 1: האם הוא פעיל *עכשיו*? ---
                // אם הוא בחדר קול, או בסטטוס אונליין/DND/Idle - הוא פעיל.
                const isOnline = member.presence && member.presence.status !== 'offline';
                const isInVoice = member.voice && member.voice.channelId;
                
                if (isInVoice || isOnline) {
                    stats.active++;
                    // עדכון אופציונלי ל-DB ברקע (כדי שלא יסומן כמת בעתיד)
                    // this.updateLastActive(userId); 
                    return;
                }

                // --- בדיקה 2: חסינות ---
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // --- בדיקה 3: חישוב הזמן האחרון שנראה (Deep Scan) ---
                const lastSeenTime = this.calculateLastSeen(member, userData, userGames);
                const daysInactive = Math.floor((now - lastSeenTime) / msPerDay);

                // הגנה לחדשים (3 ימים)
                if (daysInactive < 3) {
                    stats.newMembers++;
                    stats.active++;
                    return;
                }

                // סיווג סופי
                if (daysInactive >= TIMES.KICK) {
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

            return stats;

        } catch (error) {
            log(`❌ [UserManager] שגיאה בחישוב סטטיסטיקה: ${error.message}`);
            return null;
        }
    }

    /**
     * פונקציית עזר: מוצאת את התאריך הכי מאוחר מכל המקורות האפשריים
     */
    calculateLastSeen(member, userData, userGames) {
        let timestamps = [];

        // 1. נתונים ישירים מהמשתמש
        if (userData.meta?.lastActive) timestamps.push(new Date(userData.meta.lastActive).getTime());
        if (userData.tracking?.joinedAt) timestamps.push(new Date(userData.tracking.joinedAt).getTime());
        if (userData.identity?.lastWhatsappMessage) timestamps.push(new Date(userData.identity.lastWhatsappMessage).getTime());

        // 2. נתוני משחקים (gameStats) - רצים על כל המשחקים ומוצאים את ה-lastPlayed הכי חדש
        if (userGames) {
            Object.values(userGames).forEach(game => {
                if (game.lastPlayed) {
                    timestamps.push(new Date(game.lastPlayed).getTime());
                }
            });
        }

        // 3. זמן הצטרפות לדיסקורד (כברירת מחדל אחרונה)
        timestamps.push(member.joinedTimestamp);

        // מחזירים את המספר הכי גדול (הכי עדכני)
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
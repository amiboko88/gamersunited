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

    /**
     * עדכון פעילות - כתיבה אטומית לתוך המבנה הנקי
     */
    async updateLastActive(userId) {
        try {
            const now = new Date().toISOString();
            
            // שימוש ב-merge כדי לעדכן רק את השדות הרלוונטיים בתוך האובייקטים
            await db.collection('users').doc(userId).set({
                meta: { 
                    lastActive: now,
                    lastSeen: now 
                },
                tracking: { 
                    statusStage: 'active' 
                }
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
            voiceNow: 0,
            topActive: []
        };

        try {
            // הגנה מקריסה בעת משיכת משתמשים (Anti-Crash)
            if (guild.memberCount !== guild.members.cache.size) {
                try {
                    await guild.members.fetch({ time: 15000 }); 
                } catch (e) {}
            }
            
            const allMembers = guild.members.cache;
            stats.total = guild.memberCount; 

            // משיכת דאטה מה-DB
            const [usersSnapshot, gameStatsSnapshot] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get()
            ]);

            const usersMap = new Map();
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));

            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            let activityScores = [];

            allMembers.forEach(member => {
                if (member.user.bot) return;
                
                stats.humans++;
                const userId = member.id;
                const userData = usersMap.get(userId) || {};
                const userGames = gamesMap.get(userId) || {};

                // --- Live Status Check ---
                // אם המשתמש מחובר כרגע או בקול - הוא פעיל (0 ימים)
                const isOnline = member.presence && member.presence.status !== 'offline';
                const isInVoice = member.voice && member.voice.channelId;
                
                if (isInVoice) stats.voiceNow++;

                let daysInactive = 0;
                
                if (isOnline || isInVoice) {
                    daysInactive = 0;
                } else {
                    // חישוב לפי ה-DB הנקי בלבד
                    const lastSeenTime = this.calculateLastSeen(member, userData, userGames);
                    daysInactive = Math.floor((now - lastSeenTime) / msPerDay);
                }

                // Top 3 Score Calculation
                const xp = userData.economy?.xp || 0;
                const liveBonus = (isOnline || isInVoice) ? 500 : 0;
                const score = (1000 / (daysInactive + 1)) + (xp / 10) + liveBonus;
                
                activityScores.push({ name: member.displayName, score: score, days: daysInactive });

                // Immunity Check
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // Classification
                if (daysInactive < 3) { 
                    if (daysInactive > 0) stats.newMembers++;
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

            stats.topActive = activityScores.sort((a, b) => b.score - a.score).slice(0, 3);
            return stats;

        } catch (error) {
            log(`❌ [UserManager] שגיאה בחישוב: ${error.message}`);
            return null;
        }
    }

    /**
     * חישוב זמן אחרון - מותאם אך ורק למבנה ה-DB הנקי והמאוחד
     */
    calculateLastSeen(member, userData, userGames) {
        let timestamps = [];
        
        // 1. קריאה מהמבנה החדש והנקי בלבד (meta, tracking, identity)
        if (userData.meta) {
            if (userData.meta.lastSeen) timestamps.push(new Date(userData.meta.lastSeen).getTime());
            if (userData.meta.lastActive) timestamps.push(new Date(userData.meta.lastActive).getTime());
            if (userData.meta.firstSeen) timestamps.push(new Date(userData.meta.firstSeen).getTime());
        }

        if (userData.tracking && userData.tracking.joinedAt) {
            timestamps.push(new Date(userData.tracking.joinedAt).getTime());
        }

        if (userData.identity && userData.identity.lastWhatsappMessage) {
            timestamps.push(new Date(userData.identity.lastWhatsappMessage).getTime());
        }

        // 2. נתוני משחקים
        if (userGames) {
            Object.values(userGames).forEach(game => {
                if (game.lastPlayed) timestamps.push(new Date(game.lastPlayed).getTime());
            });
        }
        
        // 3. ברירת מחדל: דיסקורד
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
                    
                    // עדכון סטטוס ב-DB הנקי
                    await db.collection('users').doc(userId).set({ 
                        tracking: {
                            status: 'kicked',
                            kickedAt: new Date().toISOString()
                        }
                    }, { merge: true });
                }
            } catch (e) { failed.push(userId); }
        }
        return { kicked, failed };
    }
}

module.exports = new UserManager();
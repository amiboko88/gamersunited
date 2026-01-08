// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// הגדרת זמנים בימים
const DAYS = {
    DEAD: 180,    // חצי שנה - מת
    SUSPECT: 90,  // 3 חודשים - חשוד/רדום
    AFK: 30       // חודש - AFK טרי
};

const IMMUNE_ROLES_NAMES = ['MVP', 'Server Booster', 'VIP'];

class UserManager {

    async updateLastActive(userId) {
        try {
            const now = new Date().toISOString();
            await db.collection('users').doc(userId).set({
                meta: { lastActive: now, lastSeen: now },
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
            
            // הקטגוריות החדשות
            dead: [],        // מעל חצי שנה (מועמדים לקיק)
            review: [],      // מעל 3 חודשים עם פעילות עבר (לבדיקה)
            sleeping: [],    // מעל 3 חודשים ללא עבר (רדומים)
            afk: [],         // חדשים שנעלמו (AFK)
            
            kickCandidates: [], // הרשימה הסופית לבעיטה (רק ה"מתים" וה"רדומים ללא עבר")
            newMembers: 0,
            voiceNow: 0
        };

        try {
            // Anti-Crash + Force Fetch
            if (guild.memberCount !== guild.members.cache.size) {
                try { await guild.members.fetch({ time: 10000 }); } catch (e) {}
            }
            
            const allMembers = guild.members.cache;
            stats.total = guild.memberCount; 

            // משיכת דאטה
            const [usersSnapshot, gameStatsSnapshot] = await Promise.all([
                db.collection('users').get(),
                db.collection('gameStats').get()
            ]);

            const usersMap = new Map();
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));

            const gamesMap = new Map();
            gameStatsSnapshot.forEach(doc => gamesMap.set(doc.id, doc.data()));

            allMembers.forEach(member => {
                if (member.user.bot) return;
                
                stats.humans++;
                const userId = member.id;
                const userData = usersMap.get(userId) || {};
                const userGames = gamesMap.get(userId) || {};

                // --- Live Status ---
                const isOnline = member.presence && member.presence.status !== 'offline';
                const isInVoice = member.voice && member.voice.channelId;
                if (isInVoice) stats.voiceNow++;

                // חישוב ימים ללא פעילות
                let daysInactive = 0;
                if (isOnline || isInVoice) {
                    daysInactive = 0;
                } else {
                    const lastSeenTime = this.calculateLastSeen(member, userData, userGames);
                    daysInactive = Math.floor((now - lastSeenTime) / msPerDay);
                }

                // בדיקת ותק (מתי הצטרף לשרת)
                const daysSinceJoin = Math.floor((now - member.joinedTimestamp) / msPerDay);

                // נתוני עבר (XP/הודעות) לזיהוי משתמשים "חשודים"
                const hasLegacy = (userData.economy?.xp > 100) || (userData.stats?.messagesSent > 10);

                // חסינות
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // --- המיון החדש והמדויק ---

                // 1. פעילים (פחות מחודש)
                if (daysInactive < DAYS.AFK) {
                    // אם הצטרף בשבוע האחרון - נחשב "חדש"
                    if (daysSinceJoin < 7) stats.newMembers++;
                    stats.active++;
                } 
                // 2. מתים (מעל חצי שנה) - לקיק מיידי
                else if (daysInactive >= DAYS.DEAD) {
                    stats.dead.push({ userId, days: daysInactive, name: member.displayName });
                    stats.kickCandidates.push({ userId, days: daysInactive, name: member.displayName });
                }
                // 3. בדיקה (מעל 3 חודשים)
                else if (daysInactive >= DAYS.SUSPECT) {
                    if (hasLegacy) {
                        // יש לו היסטוריה - הולך ל"בדיקה" (לא לקיק אוטומטי)
                        stats.review.push({ userId, days: daysInactive, name: member.displayName });
                    } else {
                        // אין היסטוריה - הולך ל"רדומים" (אפשר להעיף)
                        stats.sleeping.push({ userId, days: daysInactive, name: member.displayName });
                        stats.kickCandidates.push({ userId, days: daysInactive, name: member.displayName });
                    }
                }
                // 4. AFK (חדשים שנעלמו)
                else {
                    // אם הוא כאן, הוא בין 30 ל-90 יום אי פעילות.
                    // אם הוא הצטרף לאחרונה יחסית (בחודשיים האחרונים) וכבר נעלם - הוא AFK.
                    if (daysSinceJoin < 60) {
                        stats.afk.push({ userId, days: daysInactive, name: member.displayName });
                    } else {
                        // ותיק שסתם נעלם לחודש - נחשב פעיל/רגיל בינתיים
                        stats.active++;
                    }
                }
            });

            return stats;

        } catch (error) {
            log(`❌ [UserManager] שגיאה בחישוב: ${error.message}`);
            return null;
        }
    }

    calculateLastSeen(member, userData, userGames) {
        let timestamps = [];
        
        // קריאה מהמבנה הנקי
        if (userData.meta) {
            if (userData.meta.lastSeen) timestamps.push(new Date(userData.meta.lastSeen).getTime());
            if (userData.meta.lastActive) timestamps.push(new Date(userData.meta.lastActive).getTime());
            if (userData.meta.firstSeen) timestamps.push(new Date(userData.meta.firstSeen).getTime());
        }
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
                    await member.kick('Shimon Inactivity Cleanup');
                    kicked.push(member.displayName);
                    await db.collection('users').doc(userId).set({ 
                        tracking: { status: 'kicked', kickedAt: new Date().toISOString() }
                    }, { merge: true });
                }
            } catch (e) { failed.push(userId); }
        }
        return { kicked, failed };
    }
}

module.exports = new UserManager();
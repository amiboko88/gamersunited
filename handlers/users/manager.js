// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// הגדרות זמנים
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
        
        const snapshot = await db.collection('users').get();
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;

        const stats = {
            total: 0,
            active: 0,
            immune: 0, 
            inactive7: [],
            inactive14: [],
            inactive30: [],
            kickCandidates: [],
            newMembers: 0
        };

        try {
            // ✅ מנגנון Fallback משוריין
            // מנסים למשוך את כולם (עד 2 דקות). אם נכשל - לא קורסים, אלא ממשיכים עם מה שיש.
            try {
                await guild.members.fetch({ time: 120000 }); 
            } catch (timeoutError) {
                console.warn(`[UserManager] ⚠️ משיכת משתמשים מלאה לקחה יותר מדי זמן. משתמש ב-Cache הקיים (${guild.members.cache.size}).`);
            }
            
            // עובדים מול ה-Cache (שעכשיו מלא או חלקי, אבל קיים)
            const membersCache = guild.members.cache;

            snapshot.forEach(doc => {
                const data = doc.data();
                const userId = doc.id;
                
                // אם המשתמש לא בשרת (או לא נטען בגלל תקלה), מדלגים
                if (!membersCache.has(userId)) return;
                
                const member = membersCache.get(userId);
                if (member.user.bot) return;

                stats.total++;

                // 1. בדיקת חסינות
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // 2. חישוב ימי אי-פעילות (כולל בדיקת וואטסאפ מה-DB)
                const dates = [
                    data.meta?.lastActive,
                    data.tracking?.joinedAt,
                    data.identity?.lastWhatsappMessage
                ].filter(d => d).map(d => new Date(d).getTime());

                const lastActiveTime = dates.length > 0 ? Math.max(...dates) : 0;
                
                let daysInactive = 0;
                if (lastActiveTime > 0) {
                    daysInactive = Math.floor((now - lastActiveTime) / msPerDay);
                } else {
                    const joinTime = member.joinedTimestamp;
                    daysInactive = Math.floor((now - joinTime) / msPerDay);
                }

                if (daysInactive < 3) {
                    stats.newMembers++;
                    stats.active++;
                    return;
                }

                // 3. סיווג
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
            log(`❌ [UserManager] שגיאה קריטית בחישוב: ${error.message}`);
            return null;
        }
    }

    async executeKickBatch(guild, userIds) {
        let kicked = [], failed = [];
        
        for (const userId of userIds) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.send("היי, עקב חוסר פעילות ממושך (30+ יום), המערכת מסירה אותך מהשרת. נשמח לראותך שוב בעתיד!").catch(() => {});
                    await member.kick('Shimon Automation: Inactivity > 30 Days');
                    kicked.push(member.displayName);
                    
                    await db.collection('users').doc(userId).update({ 
                        'tracking.status': 'kicked',
                        'tracking.kickedAt': new Date().toISOString()
                    });
                }
            } catch (e) { 
                failed.push(userId); 
                log(`Failed to kick ${userId}: ${e.message}`);
            }
        }
        return { kicked, failed };
    }
}

module.exports = new UserManager();
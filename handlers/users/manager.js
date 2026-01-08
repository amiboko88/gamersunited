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
        
        const snapshot = await db.collection('users').get();
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;

        const stats = {
            total: 0,        // סה"כ בשרת (כולל בוטים)
            humans: 0,       // סה"כ בני אדם (לניהול)
            active: 0,
            immune: 0, 
            inactive7: [],
            inactive14: [],
            inactive30: [],
            kickCandidates: [],
            newMembers: 0
        };

        try {
            // ✅ FORCE FETCH: לא סומכים על הזיכרון. מושכים הכל מהשרת של דיסקורד.
            // זה יפתור את הבעיה של ה-51 מול 61.
            const allMembers = await guild.members.fetch({ force: true });
            
            stats.total = allMembers.size; // הספירה האמיתית והמלאה

            // מיפוי מהיר של ה-DB לזיכרון
            const dbMap = new Map();
            snapshot.forEach(doc => dbMap.set(doc.id, doc.data()));

            // מעבר על כל חברי השרת האמיתיים
            allMembers.forEach(member => {
                // דילוג על בוטים בחישוב הפעילות (אבל הם נספרו ב-Total)
                if (member.user.bot) return;
                
                stats.humans++;
                const userId = member.id;
                const data = dbMap.get(userId) || {};

                // 1. בדיקת חסינות (MVP / Roles)
                const isImmune = member.roles.cache.some(r => 
                    IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                    r.id === process.env.ROLE_MVP_ID
                );

                if (isImmune) {
                    stats.immune++;
                    return;
                }

                // 2. חישוב ימי אי-פעילות (שכלול כל הנתונים)
                const dates = [
                    data.meta?.lastActive,
                    data.tracking?.joinedAt,
                    data.identity?.lastWhatsappMessage
                ].filter(d => d).map(d => new Date(d).getTime());

                // אם אין תאריך, נשתמש בזמן ההצטרפות לשרת כברירת מחדל
                const lastActiveTime = dates.length > 0 ? Math.max(...dates) : member.joinedTimestamp;
                
                const daysInactive = Math.floor((now - lastActiveTime) / msPerDay);

                // הגנה לחדשים (פחות מ-3 ימים)
                if (daysInactive < 3) {
                    stats.newMembers++;
                    stats.active++;
                    return;
                }

                // 3. סיווג לקטגוריות
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
            log(`❌ [UserManager] שגיאה במשיכת נתונים: ${error.message}`);
            return null;
        }
    }

    async executeKickBatch(guild, userIds) {
        let kicked = [], failed = [];
        for (const userId of userIds) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.send("היי, עקב חוסר פעילות ממושך, המערכת מסירה אותך מהשרת. נשמח לראותך שוב!").catch(() => {});
                    await member.kick('Shimon Automation: Inactivity');
                    kicked.push(member.displayName);
                    await db.collection('users').doc(userId).update({ 
                        'tracking.status': 'kicked',
                        'tracking.kickedAt': new Date().toISOString()
                    });
                }
            } catch (e) { 
                failed.push(userId); 
            }
        }
        return { kicked, failed };
    }
}

module.exports = new UserManager();
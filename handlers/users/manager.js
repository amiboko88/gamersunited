// 📁 handlers/users/manager.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// הגדרות זמנים (בימים)
const TIMES = {
    WARNING: 7,
    DANGER: 14,
    KICK: 30
};

// רולים חסינים (למשל MVP, בוטים, הנהלה)
// ניתן להוסיף כאן ID או שמות
const IMMUNE_ROLES_NAMES = ['MVP', 'Server Booster', 'VIP'];

class UserManager {

    /**
     * עדכון זמן פעילות אחרון (נקרא מכל מקום במערכת)
     */
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

    /**
     * הפונקציה המרכזית: ניתוח סטטיסטי של כל המשתמשים
     */
    async getInactivityStats(guild) {
        if (!guild) return null;
        
        const snapshot = await db.collection('users').get();
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;

        // מבנה הנתונים לדוח
        const stats = {
            total: 0,
            active: 0,
            immune: 0, // משתמשים מוגנים (MVP וכו')
            inactive7: [],
            inactive14: [],
            inactive30: [],
            kickCandidates: [], // הרשימה השחורה הסופית
            newMembers: 0 // הצטרפו ב-3 ימים האחרונים
        };

        // טעינת כל חברי השרת לזיכרון (לביצועים)
        const membersCache = await guild.members.fetch();

        snapshot.forEach(doc => {
            const data = doc.data();
            const userId = doc.id;
            
            // התעלמות ממשתמשים שכבר לא בשרת או שהם בוטים
            if (!membersCache.has(userId)) return;
            const member = membersCache.get(userId);
            if (member.user.bot) return;

            stats.total++;

            // 1. בדיקת חסינות (Immunity Check)
            // אם יש לו רול MVP או שהוא ברשימת המוגנים - הוא חסין
            const isImmune = member.roles.cache.some(r => 
                IMMUNE_ROLES_NAMES.some(immuneName => r.name.includes(immuneName)) ||
                r.id === process.env.ROLE_MVP_ID // במידה ומוגדר ב-ENV
            );

            if (isImmune) {
                stats.immune++;
                return; // מדלגים עליו, הוא בטוח
            }

            // 2. חישוב ימי אי-פעילות
            // אנו בודקים: lastActive (כללי), lastSeen (דיסקורד), whatsappLastMessage (אם יש)
            // לוקחים את התאריך הכי חדש מביניהם
            const dates = [
                data.meta?.lastActive,
                data.tracking?.joinedAt,
                data.identity?.lastWhatsappMessage // שדה עתידי לאיחוד מושלם
            ].filter(d => d).map(d => new Date(d).getTime());

            const lastActiveTime = dates.length > 0 ? Math.max(...dates) : 0;
            
            let daysInactive = 0;
            if (lastActiveTime > 0) {
                daysInactive = Math.floor((now - lastActiveTime) / msPerDay);
            } else {
                // משתמש רפאים (אין נתונים בכלל) -> נחשב לפי זמן הצטרפות לדיסקורד
                const joinTime = member.joinedTimestamp;
                daysInactive = Math.floor((now - joinTime) / msPerDay);
            }

            // הגנה לחדשים: אם הצטרף ב-3 ימים האחרונים, הוא "חדש" ולא לא-פעיל
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
    }

    /**
     * ביצוע הרחקה בפועל (נקרא רק אחרי אישור ידני!)
     */
    async executeKickBatch(guild, userIds) {
        let kicked = [], failed = [];
        
        for (const userId of userIds) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    // שליחת הודעה אחרונה לפני בעיטה (אופציונלי)
                    await member.send("היי, עקב חוסר פעילות ממושך (30+ יום), המערכת מסירה אותך מהשרת. נשמח לראותך שוב בעתיד!").catch(() => {});
                    
                    await member.kick('Shimon Automation: Inactivity > 30 Days');
                    kicked.push(member.displayName);
                    
                    // עדכון DB
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
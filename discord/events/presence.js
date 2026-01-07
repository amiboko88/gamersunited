// 📁 discord/events/presence.js
const { log, logRoleChange } = require('../../utils/logger');
const statTracker = require('../../handlers/users/stats'); // ✅ נתיב מעודכן לסטאט-טראקר החדש
const db = require('../../utils/firebase');

// הגדרות קבועות
const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty', 'Warzone', 'MW3'];
const ROLES = {
    WARZONE: process.env.ROLE_WARZONE_ID,
    GENERIC: process.env.ROLE_GENERIC_ID
};

class PresenceHandler {

    /**
     * הפונקציה הראשית שנקראת מה-Client Event
     */
    async handlePresenceUpdate(oldPresence, newPresence) {
        if (!newPresence || !newPresence.member || newPresence.user.bot) return;
        await this.processMember(newPresence.member, newPresence);
    }

    async processMember(member, presence) {
        const status = presence?.status || 'offline';
        const isOffline = status === 'offline' || status === 'invisible';
        
        // זיהוי פעילות
        const activities = presence?.activities || [];
        const gameActivity = activities.find(a => a.type === 0); // 0 = Playing
        const isPlayingAny = !!gameActivity;
        const gameName = gameActivity ? gameActivity.name : 'Unknown';
        
        const isWarzone = isPlayingAny && WARZONE_KEYWORDS.some(k => 
            gameName.toLowerCase().includes(k.toLowerCase())
        );

        // ניהול רולים (Roles)
        const hasWzRole = member.roles.cache.has(ROLES.WARZONE);
        const hasGenRole = member.roles.cache.has(ROLES.GENERIC);

        // תרחיש 1: לא משחק או אופליין -> הסרת רולים
        if (!isPlayingAny || isOffline) {
            if (hasWzRole) await this.toggleRole(member, ROLES.WARZONE, false, 'Warzone');
            if (hasGenRole) await this.toggleRole(member, ROLES.GENERIC, false, 'Generic');
            return;
        }

        // תרחיש 2: משחק Warzone
        if (isWarzone) {
            if (!hasWzRole) await this.toggleRole(member, ROLES.WARZONE, true, 'Warzone', gameName);
            // מסירים גנרי אם יש (כדי שלא יהיו כפילויות, או משאירים - לשיקולך. כאן הסרתי לפי הקוד המקורי)
            if (hasGenRole) await this.toggleRole(member, ROLES.GENERIC, false, 'Generic');
        } 
        // תרחיש 3: משחק משהו אחר
        else {
            if (!hasGenRole) await this.toggleRole(member, ROLES.GENERIC, true, 'Generic', gameName);
            if (hasWzRole) await this.toggleRole(member, ROLES.WARZONE, false, 'Warzone');
        }

        // 📊 עדכון סטטיסטיקה (אחת לכמה זמן, או בכניסה למשחק)
        // כאן אנחנו רק מעדכנים "Last Played". זמן מצטבר יחושב ב-Activity Loop הנפרד
        if (isPlayingAny) {
            statTracker.updateGameStats(member.id, gameName, 0); // 0 דקות, רק עדכון timestamp
        }
    }

    async toggleRole(member, roleId, shouldAdd, roleName, gameName = null) {
        if (!roleId) return;
        try {
            if (shouldAdd) {
                await member.roles.add(roleId);
                logRoleChange({ member, action: 'add', roleName, gameName });
            } else {
                await member.roles.remove(roleId);
                logRoleChange({ member, action: 'remove', roleName });
            }
        } catch (e) {
            // התעלמות משגיאות הרשאה נפוצות
            if (e.code !== 50013) console.error(`Failed to toggle role for ${member.displayName}:`, e.message);
        }
    }
}

module.exports = new PresenceHandler();
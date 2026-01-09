// 📁 discord/events/presence.js
const { Events } = require('discord.js');
const { log, logRoleChange } = require('../../utils/logger');
// מוודאים שזה טוען את ה-Handler החדש והנקי שבנינו
const statTracker = require('../../handlers/users/stats'); 
const verificationHandler = require('../../handlers/users/verification');
const db = require('../../utils/firebase');

// הגדרות קבועות
const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty', 'Warzone', 'MW3'];
const ROLES = {
    WARZONE: process.env.ROLE_WARZONE_ID,
    GENERIC: process.env.ROLE_GENERIC_ID
};

const verifiedCache = new Set();

class PresenceHandler {
    constructor() {
        this.name = Events.PresenceUpdate;
    }

    /**
     * הפונקציה שדיסקורד מריץ בעת שינוי סטטוס
     */
    async execute(oldPresence, newPresence) {
        if (!newPresence || !newPresence.member) return;
        if (newPresence.member.user.bot) return;
        
        await this.processMember(newPresence.member, newPresence);
    }

    /**
     * הפונקציה הראשית - חשופה גם ל-scheduler.js
     */
    async processMember(member, presence) {
        const activities = presence.activities || [];
        const gameActivity = activities.find(a => a.type === 0); // Playing
        const gameName = gameActivity ? gameActivity.name : 'Unknown';
        const isPlayingAny = !!gameActivity;

        // 1. ניהול רולים
        await this.handleRoleManagement(member, isPlayingAny, gameName, presence);

        // 2. עדכון סטטיסטיקה (שימוש ב-Handler החדש והבטוח)
        if (isPlayingAny) {
            // שולחים 0 דקות כי זה רק עדכון "נראה לאחרונה"
            // הלוגיקה של הוספת דקות תהיה בנפרד (ב-scheduler) כדי לא להעמיס
            statTracker.updateGameStats(member.id, gameName, 0).catch(e => console.error(e));
        }

        // 3. אימות קונסולות אוטומטי (שמרתי את הלוגיקה שלך)
        await this.checkForConsolePlayer(member, activities);
    }

    /**
     * לוגיקת ניהול רולים (Warzone / Generic)
     */
    async handleRoleManagement(member, isPlayingAny, gameName, presence) {
        const status = presence?.status || 'offline';
        const isOffline = status === 'offline' || status === 'invisible';

        const isWarzone = isPlayingAny && WARZONE_KEYWORDS.some(k => 
            gameName.toLowerCase().includes(k.toLowerCase())
        );

        const hasWzRole = member.roles.cache.has(ROLES.WARZONE);
        const hasGenRole = member.roles.cache.has(ROLES.GENERIC);

        // לא משחק או אופליין -> הסרת רולים
        if (!isPlayingAny || isOffline) {
            if (hasWzRole) await this.toggleRole(member, ROLES.WARZONE, false, 'Warzone');
            if (hasGenRole) await this.toggleRole(member, ROLES.GENERIC, false, 'Generic');
            return;
        }

        // משחק Warzone
        if (isWarzone) {
            if (!hasWzRole) await this.toggleRole(member, ROLES.WARZONE, true, 'Warzone', gameName);
            if (hasGenRole) await this.toggleRole(member, ROLES.GENERIC, false, 'Generic');
        } 
        // משחק משהו אחר
        else {
            if (!hasGenRole) await this.toggleRole(member, ROLES.GENERIC, true, 'Generic', gameName);
            if (hasWzRole) await this.toggleRole(member, ROLES.WARZONE, false, 'Warzone');
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
            if (e.code !== 50013) console.error(`[Presence] Failed to toggle role for ${member.displayName}:`, e.message);
        }
    }

    async checkForConsolePlayer(member, activities) {
        if (verifiedCache.has(member.id)) return;

        const isConsole = activities.some(act => 
            (act.name && (act.name.includes('Xbox') || act.name.includes('PlayStation'))) ||
            (act.state && (act.state.includes('Xbox') || act.state.includes('PlayStation')))
        );

        if (isConsole) {
            verifiedCache.add(member.id);
            setTimeout(() => verifiedCache.delete(member.id), 1000 * 60 * 10);
            
            // קריאה לאימות האוטומטי
            await verificationHandler.verifyUser(member, { platform: 'Console (Auto)' }, 'console_auto');
        }
    }
}

module.exports = new PresenceHandler();
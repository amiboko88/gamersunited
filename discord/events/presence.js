// 📁 discord/events/presence.js
const { Events } = require('discord.js');
const { log, logRoleChange } = require('../../utils/logger');
const statTracker = require('../../handlers/users/stats'); 
const verificationHandler = require('../../handlers/users/verification'); // ✅ התוספת החדשה
const db = require('../../utils/firebase');

// --- הגדרות קבועות (מהקוד המקורי) ---
const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty', 'Warzone', 'MW3'];
const ROLES = {
    WARZONE: process.env.ROLE_WARZONE_ID,
    GENERIC: process.env.ROLE_GENERIC_ID
};

// מטמון למניעת הצפת אימותים אוטומטיים
const verifiedCache = new Set();

module.exports = {
    name: Events.PresenceUpdate,
    
    /**
     * הפונקציה הראשית שנקראת מה-Client Event
     */
    async execute(oldPresence, newPresence) {
        if (!newPresence || !newPresence.member) return;
        const member = newPresence.member;
        if (member.user.bot) return;

        // משיכת נתונים בסיסיים
        const activities = newPresence.activities || [];
        const gameActivity = activities.find(a => a.type === 0); // Playing
        const gameName = gameActivity ? gameActivity.name : 'Unknown';
        const isPlayingAny = !!gameActivity;
        
        // ---------------------------------------------------------
        // 1️⃣ לוגיקה מקורית: ניהול רולים (Warzone / Generic)
        // ---------------------------------------------------------
        await handleRoleManagement(member, isPlayingAny, gameName, activities);

        // ---------------------------------------------------------
        // 2️⃣ לוגיקה מקורית: עדכון סטטיסטיקה
        // ---------------------------------------------------------
        if (isPlayingAny) {
            // עדכון Timestamp בלבד (חישוב זמן נעשה במקום אחר)
            statTracker.updateGameStats(member.id, gameName, 0).catch(e => console.error(e));
        }

        // ---------------------------------------------------------
        // 3️⃣ לוגיקה חדשה: זיהוי אוטומטי לקונסולות (Auto-Verify)
        // ---------------------------------------------------------
        await checkForConsolePlayer(member, activities);
    }
};

/**
 * פונקציית עזר: ניהול רולים (הועתקה ושופרה מהקוד המקורי)
 */
async function handleRoleManagement(member, isPlayingAny, gameName, activities) {
    const status = member.presence?.status || 'offline';
    const isOffline = status === 'offline' || status === 'invisible';

    const isWarzone = isPlayingAny && WARZONE_KEYWORDS.some(k => 
        gameName.toLowerCase().includes(k.toLowerCase())
    );

    const hasWzRole = member.roles.cache.has(ROLES.WARZONE);
    const hasGenRole = member.roles.cache.has(ROLES.GENERIC);

    // תרחיש A: לא משחק או אופליין -> הסרת רולים
    if (!isPlayingAny || isOffline) {
        if (hasWzRole) await toggleRole(member, ROLES.WARZONE, false, 'Warzone');
        if (hasGenRole) await toggleRole(member, ROLES.GENERIC, false, 'Generic');
        return;
    }

    // תרחיש B: משחק Warzone
    if (isWarzone) {
        if (!hasWzRole) await toggleRole(member, ROLES.WARZONE, true, 'Warzone', gameName);
        if (hasGenRole) await toggleRole(member, ROLES.GENERIC, false, 'Generic');
    } 
    // תרחיש C: משחק משהו אחר
    else {
        if (!hasGenRole) await toggleRole(member, ROLES.GENERIC, true, 'Generic', gameName);
        if (hasWzRole) await toggleRole(member, ROLES.WARZONE, false, 'Warzone');
    }
}

/**
 * פונקציית עזר: ביצוע שינוי הרול בפועל
 */
async function toggleRole(member, roleId, shouldAdd, roleName, gameName = null) {
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

/**
 * פונקציית עזר: זיהוי קונסולות (החדש)
 */
async function checkForConsolePlayer(member, activities) {
    // הגנה: אם כבר בדקנו אותו לאחרונה, נדלג
    if (verifiedCache.has(member.id)) return;

    // הגנה: אם כבר יש לו רול מאומת כלשהו (לפי בדיקה מהירה) - אפשר לדלג
    // אבל ה-VerifyHandler עושה בדיקה יסודית יותר, אז נסמוך עליו.

    const isConsole = activities.some(act => 
        (act.name && (act.name.includes('Xbox') || act.name.includes('PlayStation'))) ||
        (act.state && (act.state.includes('Xbox') || act.state.includes('PlayStation'))) ||
        (act.details && (act.details.includes('Xbox') || act.details.includes('PlayStation')))
    );

    if (isConsole) {
        // הוספה ל-Cache ל-10 דקות
        verifiedCache.add(member.id);
        setTimeout(() => verifiedCache.delete(member.id), 1000 * 60 * 10);

        log(`[AutoVerify] 🎮 זוהה שחקן קונסולה פוטנציאלי: ${member.displayName}`);
        
        // שליחה ל-Handler (הוא יבדוק אם המשתמש כבר מאומת ויטפל בו)
        await verificationHandler.verifyUser(member, { platform: 'Console (Auto)' }, 'console_auto');
    }
}
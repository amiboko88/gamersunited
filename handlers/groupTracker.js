// 📁 handlers/groupTracker.js
const { log } = require('../utils/logger');

// מפה למעקב אחרי קבוצות פעילות: ChannelID -> { createdAt, members, teamName }
const activeGroups = new Map();

/**
 * מתחיל מעקב אחרי קבוצה חדשה שנוצרה
 */
function startGroupTracking(channel, memberIds, teamName) {
    activeGroups.set(channel.id, {
        createdAt: Date.now(),
        members: memberIds,
        teamName: teamName
    });
    // log(`[GroupTracker] מעקב התחיל עבור ${teamName} (${channel.id})`);
}

/**
 * מפסיק מעקב אחרי קבוצה (למשל כשנמחקת)
 */
function stopGroupTracking(channelId) {
    if (activeGroups.has(channelId)) {
        activeGroups.delete(channelId);
    }
}

/**
 * פונקציית ה-Cron: בודקת קבוצות ריקות ומוחקת אותן
 */
async function checkEmptyGroups(client) {
    if (activeGroups.size === 0) return;

    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 דקות של חסד

    for (const [channelId, data] of activeGroups) {
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);

            // אם הערוץ נמחק ידנית כבר
            if (!channel) {
                activeGroups.delete(channelId);
                continue;
            }

            // אם הערוץ ריק מאנשים
            if (channel.members.size === 0) {
                // בדיקה כמה זמן הוא ריק/קיים
                if (now - data.createdAt > TIMEOUT) {
                    await channel.delete('קבוצה ריקה - ניקוי אוטומטי');
                    activeGroups.delete(channelId);
                    log(`🗑️ [GroupTracker] הקבוצה ${data.teamName} נמחקה עקב חוסר פעילות.`);
                }
            } else {
                // אם יש אנשים, אפשר לעדכן את זמן הפעילות (אופציונלי)
                // data.lastActive = now; 
            }
        } catch (error) {
            console.error(`❌ Error checking group ${channelId}:`, error.message);
        }
    }
}

module.exports = { 
    startGroupTracking, 
    stopGroupTracking, 
    checkEmptyGroups 
};
const { log } = require('../../utils/logger');

let membersCache = new Map();
let lastUpdate = 0;
const CACHE_TTL = 1000 * 60 * 15; // רבע שעה

async function updateDiscordCache(discordClient) {
    try {
        const guild = discordClient.guilds.cache.first(); // מניח שיש שרת אחד ראשי
        if (!guild) return;

        log('[Discord Cache] 🔄 Updating members cache...');
        const members = await guild.members.fetch();
        
        members.forEach(member => {
            membersCache.set(member.id, {
                displayName: member.displayName,
                username: member.user.username,
                roles: member.roles.cache.map(r => r.name),
                // אפשר לשמור פה גם XP אם יש לך דרך למשוך אותו
            });
        });

        lastUpdate = Date.now();
        log(`[Discord Cache] ✅ Cached ${members.size} members.`);
    } catch (error) {
        log(`[Discord Cache] ❌ Error updating: ${error.message}`);
    }
}

function getCachedMember(discordId) {
    return membersCache.get(discordId);
}

// קריאה לפונקציה הזו מתוך ה-cron.js כל X דקות
module.exports = { updateDiscordCache, getCachedMember };
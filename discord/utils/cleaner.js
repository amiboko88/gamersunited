// 📁 discord/utils/cleaner.js
const { ChannelType } = require('discord.js');
const { log } = require('../../utils/logger');

// קטגוריות לניקוי (אפשר להוסיף עוד בעתיד)
const TARGET_PREFIX = 'TEAM'; 

async function cleanupEmptyVoiceChannels(client) {
    if (!client || !client.isReady()) return;

    try {
        // רץ על כל השרתים שהבוט נמצא בהם
        for (const guild of client.guilds.cache.values()) {
            
            // שליפת ערוצים רלוונטיים: קול + מתחילים ב-TEAM + ריקים
            const emptyChannels = guild.channels.cache.filter(c => 
                c.type === ChannelType.GuildVoice &&
                c.name.startsWith(TARGET_PREFIX) && 
                c.members.size === 0
            );

            if (emptyChannels.size === 0) continue;

            // לוג רק אם יש פעילות
            // log(`[Cleaner] 🧹 מנקה ${emptyChannels.size} ערוצים בשרת ${guild.name}...`);

            for (const [id, channel] of emptyChannels) {
                if (channel.deletable) {
                    await channel.delete('ניקוי ערוץ ריק (אוטומטי)').catch(() => {});
                }
            }
        }
    } catch (error) {
        console.error('[Cleaner] ❌ Error:', error.message);
    }
}

module.exports = { cleanupEmptyVoiceChannels };
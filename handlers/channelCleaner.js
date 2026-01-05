// 📁 handlers/channelCleaner.js
const { ChannelType } = require('discord.js');
const { log } = require('../utils/logger');

// הגדרת קטגוריית ה-FIFO (אם רוצים לנקות רק שם)
// כרגע נגדיר אותו לנקות ערוצים שמתחילים ב-"TEAM" בכל הקטגוריות הרלוונטיות
const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID; 

/**
 * סורק את השרת ומוחק ערוצי קול זמניים (TEAM X) שאין בהם אנשים.
 * @param {import('discord.js').Client} client 
 */
async function cleanupEmptyVoiceChannels(client) {
    try {
        const guild = client.guilds.cache.first(); // עובדים על השרת הראשון שמצאנו (או ספציפי לפי ID)
        if (!guild) return;

        // שליפת כל הערוצים
        // מסננים: ערוצי קול + מתחילים ב-"TEAM" + ריקים מאדם
        const emptyChannels = guild.channels.cache.filter(c => 
            c.type === ChannelType.GuildVoice &&
            c.name.startsWith('TEAM') && // מנקים רק ערוצים שהבוט יצר
            c.members.size === 0
        );

        if (emptyChannels.size === 0) return;

        log(`[ChannelCleaner] 🧹 נמצאו ${emptyChannels.size} ערוצים ריקים למחיקה.`);

        for (const [id, channel] of emptyChannels) {
            try {
                await channel.delete('ניקוי ערוץ ריק (אוטומטי)');
                // log(`🗑️ ערוץ נמחק: ${channel.name}`); // אפשר להחזיר אם רוצים לוג מפורט
            } catch (err) {
                console.warn(`⚠️ נכשל במחיקת ערוץ ${channel.name}: ${err.message}`);
            }
        }

    } catch (error) {
        console.error('[ChannelCleaner] ❌ Error:', error);
    }
}

// ✅ הייצוא הקריטי - זה מה ש-botLifecycle מחפש
module.exports = { cleanupEmptyVoiceChannels };
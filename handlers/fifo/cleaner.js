// 📁 handlers/fifo/cleaner.js
const { ChannelType } = require('discord.js');
const { log } = require('../../utils/logger');

const TARGET_PREFIX = 'TEAM'; 

class FifoCleaner {

    /**
     * פונקציית הניקוי הראשית
     * רצה בלולאה ומחפשת ערוצי TEAM ריקים
     */
    async cleanEmptyChannels(client) {
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

                // ביצוע המחיקה
                for (const [id, channel] of emptyChannels) {
                    if (channel.deletable) {
                        await channel.delete('Auto-Cleaner: Empty Team Channel').catch(err => {
                            // לוג שקט במקרה של שגיאה (כדי לא להספים)
                            // console.warn(`Failed to delete channel ${channel.name}: ${err.message}`);
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[FifoCleaner] ❌ Error:', error.message);
        }
    }

    /**
     * מפעיל את הטיימר האוטומטי (נקרא מ-Ready)
     * @param {Client} client 
     * @param {number} intervalMs ברירת מחדל: 5 דקות
     */
    startAutoClean(client, intervalMs = 1000 * 60 * 5) {
        log('[FifoCleaner] 🧹 מנגנון ניקוי אוטומטי הופעל.');
        
        // הרצה ראשונית
        this.cleanEmptyChannels(client);

        // הרצה מחזורית
        setInterval(() => {
            this.cleanEmptyChannels(client);
        }, intervalMs);
    }
}

module.exports = new FifoCleaner();
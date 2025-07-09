// 📁 handlers/channelCleaner.js
const { ChannelType } = require('discord.js');

const CATEGORY_ID = '689124379019313214'; // קטגוריית פיפו הראשית

/**
 * מוחק ערוצים קוליים ריקים ששמם מתחיל ב-"TEAM" בקטגוריה ספציפית.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function cleanupEmptyChannels(client) {
  console.log('🧹 מתחיל סריקה לניקוי ערוצים קוליים ריקים...');
  
  for (const guild of client.guilds.cache.values()) {
    const category = guild.channels.cache.get(CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      console.warn(`לא נמצאה קטגוריה עם ה-ID: ${CATEGORY_ID} בשרת ${guild.name}`);
      continue;
    }

    const teamChannels = category.children.cache.filter(
      c => c.type === ChannelType.GuildVoice && c.name.startsWith('TEAM')
    );

    if (teamChannels.size === 0) {
      console.log(`לא נמצאו ערוצי TEAM לניקוי בשרת ${guild.name}.`);
      continue;
    }

    for (const [id, channel] of teamChannels) {
      if (channel.members.size === 0) {
        try {
          await channel.delete('ניקוי אוטומטי של ערוץ ריק');
          console.log(`✅ נמחק הערוץ הריק: ${channel.name}`);
        } catch (error) {
          console.error(`❌ שגיאה במחיקת הערוץ ${channel.name}:`, error);
        }
      }
    }
  }
}

module.exports = { cleanupEmptyChannels };
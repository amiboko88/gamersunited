// 📁 utils/staffLogger.js (גרסה מתוקנת המשתמשת ב-global.client)
const { EmbedBuilder } = require('discord.js');

// 🚨 הגדר את ה-ID של ערוץ הצוות כאן (קבוע בקוד)
const STAFF_CHANNEL_ID = '881445829100060723'; 

/**
 * שולח הודעת לוג לערוץ הצוות.
 * @param {string} title - כותרת ההודעה.
 * @param {string} description - תוכן ההודעה.
 * @param {number} color - צבע האמבד (בפורמט הקסדצימלי).
 * @param {Array<Object>} [fields=[]] - מערך של שדות להוספה לאמבד.
 */
async function sendStaffLog(title, description, color, fields = []) {
    // ✅ [תיקון] שימוש ישיר במשתנה הגלובלי global.client שהוגדר ב-index.js
    const client = global.client; 
    
    if (!client) {
        console.error('⚠️ global.client של דיסקורד אינו זמין. ודא שהוא מוגדר ב-index.js. לא ניתן לשלוח לוג צוות.');
        return;
    }

    if (!STAFF_CHANNEL_ID) {
        console.error('⚠️ STAFF_CHANNEL_ID אינו מוגדר. לא ניתן לשלוח לוג צוות.');
        return;
    }

    try {
        const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID); 
        if (staffChannel) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp();
            
            if (fields && fields.length > 0) {
                const flattenedFields = fields.flat();
                embed.addFields(flattenedFields.slice(0, 25));
                if (flattenedFields.length > 25) {
                    console.warn('⚠️ sendStaffLog: יותר מ-25 שדות סופקו.');
                }
            }
            
            await staffChannel.send({ embeds: [embed] });
            // console.log(`✅ לוג צוות נשלח לערוץ ${staffChannel.name}: ${title}`); // ניתן להסיר כדי למנוע ספאם בלוגים
        } else {
            console.error(`❌ לא ניתן למצוא את ערוץ הצוות (ID: ${STAFF_CHANNEL_ID}).`);
        }
    } catch (error) {
        console.error(`🛑 שגיאה בשליחת לוג צוות לערוץ ${STAFF_CHANNEL_ID}:`, error);
    }
}

module.exports = {
    sendStaffLog
};
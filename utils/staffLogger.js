// 📁 utils/staffLogger.js
const { EmbedBuilder } = require('discord.js');

// 🚨 הגדר את ה-ID של ערוץ הצוות כאן (קבוע בקוד)
const STAFF_CHANNEL_ID = '881445829100060723'; 

/**
 * שולח הודעת לוג לערוץ הצוות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט.
 * @param {string} title - כותרת ההודעה.
 * @param {string} description - תוכן ההודעה.
 * @param {number} color - צבע האמבד (בפורמט הקסדצימלי, לדוגמה 0x00FF00).
 * @param {Array<Object>} [fields=[]] - מערך של שדות להוספה לאמבד.
 */
async function sendStaffLog(client, title, description, color, fields = []) {
    if (!STAFF_CHANNEL_ID) {
        console.error('⚠️ STAFF_CHANNEL_ID אינו מוגדר ב-utils/staffLogger.js. לא ניתן לשלוח לוג צוות.');
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
            
            // Discord API limits: max 25 fields per embed. Check if fields exist before adding.
            if (fields && fields.length > 0) {
                // If allFields is an array of embed-like objects, flatten them
                // This assumes createPaginatedFields returns an array of simple field objects
                // If it returns an array of arrays (pages), you might need a different handling
                const flattenedFields = fields.flat(); // Flatten in case createPaginatedFields returned nested arrays
                if (flattenedFields.length > 0) {
                    embed.addFields(flattenedFields.slice(0, 25)); // Add up to 25 fields
                    if (flattenedFields.length > 25) {
                        console.warn('⚠️ sendStaffLog: More than 25 fields provided. Only first 25 will be displayed.');
                        // Consider sending multiple embeds if you have more than 25 fields
                    }
                }
            }
            
            await staffChannel.send({ embeds: [embed] });
            console.log(`✅ לוג צוות נשלח לערוץ ${staffChannel.name}: ${title}`);
        } else {
            console.error(`❌ לא ניתן למצוא את ערוץ הצוות (ID: ${STAFF_CHANNEL_ID}). דוח אי-פעילות לא נשלח לערוץ.`);
        }
    } catch (error) {
        console.error(`🛑 שגיאה בשליחת לוג צוות לערוץ ${STAFF_CHANNEL_ID}:`, error);
    }
}

module.exports = {
    sendStaffLog
};
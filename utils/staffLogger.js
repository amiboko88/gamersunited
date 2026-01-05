// 📁 utils/staffLogger.js
const { EmbedBuilder } = require('discord.js');

// 🚨 הגדר את ה-ID של ערוץ הצוות כאן
const STAFF_CHANNEL_ID = '881445829100060723'; 

/**
 * שולח הודעת לוג לערוץ הצוות.
 * חתימה: (title, description, color, fields)
 */
async function sendStaffLog(arg1, arg2, arg3, arg4) {
    // ✅ מנגנון הגנה חכם (Overload Protection):
    // אם הארגומנט הראשון הוא אובייקט (כמו client) במקום מחרוזת, אנחנו מזיזים את הארגומנטים
    // כדי להתאים לחתימה החדשה ולמנוע קריסה.
    let title, description, color, fields;

    if (typeof arg1 === 'object' && arg1 !== null) {
        // זוהה שמישהו שלח client בטעות - נתעלם ממנו ונזיז הכל ימינה
        title = arg2;
        description = arg3;
        color = arg4;
        fields = [];
    } else {
        // שימוש רגיל ותקין
        title = arg1;
        description = arg2;
        color = arg3;
        fields = arg4 || [];
    }

    // משתמשים במשתנה הגלובלי שהגדרנו ב-index.js
    const client = global.client; 
    
    if (!client) {
        console.error('⚠️ global.client של דיסקורד אינו זמין. ודא שהוא מוגדר ב-index.js.');
        return;
    }

    if (!STAFF_CHANNEL_ID) {
        console.error('⚠️ STAFF_CHANNEL_ID אינו מוגדר.');
        return;
    }

    try {
        const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null); 
        
        if (staffChannel) {
            // וידוא שהצבע תקין (אם לא נשלח, ברירת מחדל אדום)
            const embedColor = typeof color === 'number' ? color : 0xFF0000;
            const safeTitle = title ? String(title).substring(0, 250) : 'לוג מערכת';
            const safeDesc = description ? String(description).substring(0, 4000) : 'ללא תוכן';

            const embed = new EmbedBuilder()
                .setTitle(safeTitle)
                .setDescription(safeDesc)
                .setColor(embedColor)
                .setTimestamp();
            
            if (fields && Array.isArray(fields) && fields.length > 0) {
                // שיטוח המערך ומניעת חריגה מ-25 שדות
                const flattenedFields = fields.flat();
                embed.addFields(flattenedFields.slice(0, 25));
            }
            
            await staffChannel.send({ embeds: [embed] });
        } else {
            console.warn(`[StaffLogger] לא ניתן למצוא את ערוץ הצוות: ${STAFF_CHANNEL_ID}`);
        }
    } catch (error) {
        console.error(`[StaffLogger] שגיאה בשליחת לוג: ${error.message}`);
    }
}

module.exports = { sendStaffLog };
// 📁 utils/staffLogger.js
const { EmbedBuilder } = require('discord.js');
// ✅ הגדרת ID של ערוץ הסטאף ישירות בקובץ
const STAFF_CHANNEL_ID = '881445829100060723'; // ה-ID שסיפקת

async function sendStaffLog(client, title, description, color, fields = []) {
    try {
        const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
        if (staffChannel && staffChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp();
            if (fields.length > 0) embed.addFields(fields);
            await staffChannel.send({ embeds: [embed] });
        } else {
            console.warn(`[STAFF_LOG] ⚠️ ערוץ הצוות לא נמצא או אינו ערוץ טקסט (ID: ${STAFF_CHANNEL_ID}). לוג לא נשלח לדיסקורד.`);
        }
    } catch (error) {
        console.error(`[STAFF_LOG] ❌ שגיאה בשליחת לוג לדיסקורד:`, error);
    }
}

module.exports = { sendStaffLog };
// 📁 utils/staffLogger.js
const { EmbedBuilder } = require('discord.js');
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID || '881445829100060723';

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
        }
    } catch (error) {
        console.error(`[STAFF_LOG] ❌ שגיאה בשליחת לוג:`, error);
    }
}

module.exports = { sendStaffLog };
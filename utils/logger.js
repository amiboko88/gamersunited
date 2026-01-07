// 📁 utils/logger.js
const { WebhookClient, EmbedBuilder } = require('discord.js');

// הגדרות
const WEBHOOK_URL = process.env.LOG_WEBHOOK_URL;
const STAFF_CHANNEL_ID = '881445829100060723'; // ערוץ הצוות

const webhookClient = WEBHOOK_URL ? new WebhookClient({ url: WEBHOOK_URL }) : null;

const Logger = {
    // 1. לוג רגיל (קונסול + וובהוק)
    info: (message) => {
        console.log(`ℹ️ ${message}`);
        if (webhookClient) webhookClient.send(`ℹ️ ${message}`).catch(() => {});
    },

    error: (message, error) => {
        console.error(`❌ ${message}`, error);
        if (webhookClient) webhookClient.send(`❌ **ERROR:** ${message}\n\`${error?.message || error}\``).catch(() => {});
    },

    // 2. לוג לצוות (מחליף את staffLogger)
    staff: async (client, title, description, color = 'Blue', fields = []) => {
        if (!client || !STAFF_CHANNEL_ID) return;
        
        try {
            const channel = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .addFields(fields.slice(0, 25)) // מגבלת דיסקורד
                .setTimestamp()
                .setFooter({ text: 'Shimon AI Security' });

            await channel.send({ embeds: [embed] });
        } catch (e) {
            console.error('Failed to send staff log:', e);
        }
    },

    // 3. לוג שינוי רולים (לנוכחות)
    roleChange: ({ member, action, roleName, gameName }) => {
        if (!webhookClient) return;
        const embed = new EmbedBuilder()
            .setTitle(action === 'add' ? '✅ תפקיד נוסף' : '❌ תפקיד הוסר')
            .setColor(action === 'add' ? 'Green' : 'Red')
            .setDescription(`**משתמש:** ${member.user.tag}\n**תפקיד:** ${roleName}` + (gameName ? `\n**משחק:** ${gameName}` : ''))
            .setTimestamp();
        webhookClient.send({ embeds: [embed] }).catch(() => {});
    }
};

module.exports = { log: Logger.info, error: Logger.error, sendStaffLog: Logger.staff, logRoleChange: Logger.roleChange };
// 📁 utils/embedUtils.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
    /**
     * יוצר Embed בסיסי ומעוצב לשימוש בכל המערכת
     * @param {string} type - סוג ההודעה (success, error, info, warning)
     * @param {string} title - כותרת
     * @param {string} description - תוכן ההודעה
     */
    createEmbed: (type, title, description) => {
        const colors = {
            success: '#2ecc71', // ירוק
            error: '#e74c3c',   // אדום
            info: '#3498db',    // כחול
            warning: '#f1c40f', // צהוב
            admin: '#9b59b6'    // סגול
        };

        return new EmbedBuilder()
            .setColor(colors[type] || colors.info)
            .setTitle(title || '')
            .setDescription(description || '')
            .setTimestamp()
            .setFooter({ text: 'Gamers United System', iconURL: 'https://i.imgur.com/y8v8F0p.png' });
    },

    /**
     * קיצורי דרך נפוצים (כדי למנוע שגיאות if not a function)
     */
    success: (title, desc) => module.exports.createEmbed('success', title, desc),
    error: (title, desc) => module.exports.createEmbed('error', title, desc),
    info: (title, desc) => module.exports.createEmbed('info', title, desc),
    warning: (title, desc) => module.exports.createEmbed('warning', title, desc)
};
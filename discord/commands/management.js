// 📁 discord/commands/management.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dashboardHandler = require('../../handlers/users/dashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage') // שם טכני באנגלית (מונע שגיאות)
        .setDescription('📊 פאנל ניהול משתמשים, סטטיסטיקות וניקוי')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // וידוא הרשאות (בנוסף להגדרת הדיסקורד)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '⛔ אין לך הרשאות להשתמש בפקודה זו.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        // שימוש ב-Defer כי טעינת הנתונים והגרפים לוקחת זמן
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // קריאה להאנדלר להצגת הדשבורד
        await dashboardHandler.showMainDashboard(interaction);
    }
};
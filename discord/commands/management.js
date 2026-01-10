// 📁 discord/commands/management.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dashboardHandler = require('../../handlers/users/dashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage') 
        .setDescription('📊 פאנל ניהול המערכת (סטטיסטיקות, ניקוי וסנכרון)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '⛔ אין לך הרשאות להשתמש בפקודה זו.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // קריאה להצגת הדשבורד הראשי (שם יהיה כפתור הסנכרון)
        await dashboardHandler.showMainDashboard(interaction);
    }
};
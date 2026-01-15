// 📁 discord/commands/management.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dashboardHandler = require('../../handlers/users/dashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('management')
        .setDescription('🛠️ פאנל ניהול ראשי (דשבורד, וואטסאפ, מערכת)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // שולח ישר את הדשבורד הגרפי הגדול והחכם
        await dashboardHandler.showMainDashboard(interaction, false);
    }
};


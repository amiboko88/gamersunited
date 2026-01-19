// 📁 discord/commands/management.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dashboardHandler = require('../../handlers/users/dashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('management')
        .setDescription('🛠️ פאנל ניהול ראשי (דשבורד, וואטסאפ, מערכת)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Defer immediately to prevent timeout (rendering takes > 3s)
        await interaction.deferReply({ flags: 64 });

        // שולח ישר את הדשבורד הגרפי הגדול והחכם
        // The handler checks interaction.deferred and will use editReply
        await dashboardHandler.showMainDashboard(interaction, false);
    }
};


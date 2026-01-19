const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const platformManager = require('../../handlers/users/platformManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('platforms')
        .setDescription('🛠️ Platform Command Center (WA/TG/DC)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await platformManager.showMainSelector(interaction);
    }
};

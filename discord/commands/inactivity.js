// 📁 commands/inactivity.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dashboardHandler = require('../handlers/users/dashboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ניהול_משתמשים') // שם מעודכן
    .setDescription('📊 פאנל ניהול משתמשים ואי-פעילות')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await dashboardHandler.getDashboard(interaction);
    await interaction.editReply(payload);
  }
};
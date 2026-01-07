// 📁 commands/verify.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const verificationHandler = require('../handlers/users/verification');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('אימות')
    .setDescription('✅ אימות וקבלת גישה לשרת'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await verificationHandler.verifyUser(interaction.member, 'slash_command');
    await interaction.editReply({ content: result.message });
  }
};
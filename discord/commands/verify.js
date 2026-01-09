// 📁 discord/commands/verify.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const verificationHandler = require('../../handlers/users/verification');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify') // ✅ שינוי לאנגלית
        .setDescription('✅ ביצוע אימות מהיר וקבלת גישה לשרת'),

    async execute(interaction) {
        // בדיקה מהירה לפני שבכלל פונים להנדלר
        if (interaction.member.roles.cache.has('1120787309432938607')) {
            return interaction.reply({ 
                content: '🛑 אתה כבר מאומת. אין צורך לבצע פעולה זו שוב.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        const result = await verificationHandler.verifyUser(interaction.member, 'slash_command');
        
        await interaction.editReply({ content: result.message });
    }
};
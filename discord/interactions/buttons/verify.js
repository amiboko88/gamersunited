// 📁 interactions/buttons/verify.js
const verificationHandler = require('../../handlers/users/verification');
const { MessageFlags } = require('discord.js');

module.exports = {
    customId: 'verify_me_button', // וודא שזה ה-ID שמוגדר בהודעה בחדר האימות
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await verificationHandler.verifyUser(interaction.member, 'button_click');
        await interaction.editReply({ content: result.message });
    }
};
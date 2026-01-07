// 📁 interactions/modals/birthday_modal.js
const birthdayManager = require('../../../handlers/birthday/manager');
const { MessageFlags } = require('discord.js');

module.exports = {
    customId: 'submit_birthday',

    async execute(interaction) {
        const input = interaction.fields.getTextInputValue('bday_date');
        const [day, month, year] = input.split(/[\.\/]/).map(Number);

        if (!day || !month || !year) {
            return interaction.reply({ content: '❌ תאריך לא תקין.', flags: MessageFlags.Ephemeral });
        }

        try {
            // ✅ הקריאה למנהל!
            const { age } = await birthdayManager.registerUser(interaction.user.id, 'discord', day, month, year);
            
            await interaction.reply({ 
                content: `✅ נרשם בהצלחה! (גיל: ${age})\nנחגוג לך בתאריך ${day}/${month}.`, 
                flags: MessageFlags.Ephemeral 
            });
        } catch (error) {
            await interaction.reply({ content: `❌ שגיאה: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
};
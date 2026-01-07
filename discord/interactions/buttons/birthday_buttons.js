// 📁 discord/interactions/modals/birthday_modal.js
// ✅ תיקון נתיב: יציאה משולשת (../../../) כדי להגיע לתיקייה הראשית
const birthdayManager = require('../../../handlers/birthday/manager');
const { MessageFlags } = require('discord.js');

module.exports = {
    customId: 'submit_birthday',

    async execute(interaction) {
        const input = interaction.fields.getTextInputValue('bday_date');
        // תמיכה בפורמטים שונים (נקודה או סלאש)
        const [day, month, year] = input.split(/[\.\/]/).map(s => parseInt(s.trim()));

        if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year)) {
            return interaction.reply({ content: '❌ תאריך לא תקין. נסה פורמט: 24.10.1990', flags: MessageFlags.Ephemeral });
        }

        try {
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
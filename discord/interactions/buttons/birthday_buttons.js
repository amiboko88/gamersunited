// 📁 interactions/buttons/birthday_buttons.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    customId: (interaction) => interaction.customId === 'open_birthday_modal',
    
    async execute(interaction) {
        // פשוט פותח מודאל. אין כאן לוגיקה עסקית.
        const modal = new ModalBuilder()
            .setCustomId('submit_birthday')
            .setTitle('📅 מתי נולדת?');

        const dateInput = new TextInputBuilder()
            .setCustomId('bday_date')
            .setLabel('תאריך (לדוגמה: 24.10.1995)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
        await interaction.showModal(modal);
    }
};
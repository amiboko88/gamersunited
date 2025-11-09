// 📁 interactions/buttons/help_ai_modal.js (מטפל בכפתור AI)
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    // מזהה את כפתור פתיחת המודאל
    customId: (interaction) => {
        return interaction.isButton() && interaction.customId === 'help_ai_modal_button'; 
    },

    async execute(interaction) {
        try {
            const modal = new ModalBuilder()
                .setCustomId('help_ai_submit') // ה-ID שיופעל בשליחת הטופס
                .setTitle('🤖 שאל את שמעון');

            const questionInput = new TextInputBuilder()
                .setCustomId('ai_question_input')
                .setLabel('מה תרצה לשאול?')
                .setPlaceholder('לדוגמה: "איך מפעילים פיפו?" או "איך אני מוסיף יום הולדת?"')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(questionInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);

        } catch (error) {
            console.error("❌ שגיאה בהצגת המודאל של /עזרה:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ שגיאה בפתיחת המודאל.', ephemeral: true });
            }
        }
    }
};
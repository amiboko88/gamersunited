// 📁 interactions/modals/help_ai_submit.js
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { getShimonReply } = require('../../handlers/helpai'); // ✅ החיבור למוח
const { log } = require('../../utils/logger');

module.exports = {
    customId: 'help_ai_submit',
    type: 'isModalSubmit',
    
    async execute(interaction) {
        try {
            const question = interaction.fields.getTextInputValue('ai_question_input');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // שליחה למוח של שמעון
            // המוח כבר יודע למשוך את פרטי המשתמש מה-DB בעצמו
            const answer = await getShimonReply({
                text: question,
                userId: interaction.user.id,
                displayName: interaction.member.displayName,
                isAdmin: interaction.member.permissions.has('Administrator')
            });

            const embed = new EmbedBuilder()
                .setTitle('🤖 שמעון עונה:')
                .setDescription(`**שאלת:** ${question}\n\n**תשובה:** ${answer}`)
                .setColor('#00b0f4') // צבע הייטק
                .setFooter({ text: 'AI powered by Gamers United Brain' });

            await interaction.editReply({ embeds: [embed] });
            
            log(`[AI Help] ${interaction.user.tag} שאל: "${question}" | תשובה: "${answer}"`);

        } catch (error) {
            console.error("❌ Error in help_ai_submit:", error);
            await interaction.editReply({ content: '❌ שמעון נחנק לרגע. נסה שוב.', flags: MessageFlags.Ephemeral });
        }
    }
};
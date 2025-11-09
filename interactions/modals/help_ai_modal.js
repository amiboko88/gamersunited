// 📁 interactions/modals/help_ai_submit.js
const { MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger');

// 💡 כאן נטמיע בעתיד את הלוגיקה של ה-AI
async function getAIResponse(question) {
    // ... לוגיקה עתידית ...
    log(`[Help AI] שאלה שהתקבלה: ${question}`);
    // החזרת תשובת דמה זמנית
    return `קיבלתי את שאלתך: "${question}".\n\nכרגע אני עוד לומד, אבל בקרוב אוכל לענות לך תשובות חכמות על כל הפקודות בשרת!`;
}

module.exports = {
    customId: 'help_ai_submit', // ✅ תואם ל-ID מהמודאל
    type: 'isModalSubmit', 
    
    async execute(interaction) {
        try {
            const question = interaction.fields.getTextInputValue('ai_question_input');
            await interaction.deferReply({ ephemeral: true });

            // קריאה לפונקציית ה-AI (כרגע מחזירה תשובת דמה)
            const response = await getAIResponse(question);

            await interaction.editReply({
                content: `**השאלה שלך:**\n> ${question}\n\n**🤖 התשובה של שמעון:**\n${response}`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            log('❌ שגיאה בטיפול ב-AI Modal Submit:', error);
            await interaction.followUp({
                content: 'אירעה שגיאה בעיבוד שאלתך.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
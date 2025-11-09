// 📁 interactions/modals/help_ai_submit.js (מטפל בשליחת מודאל AI)
const { MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger');

// 💡 כאן תוטמע בעתיד הלוגיקה האמיתית של ה-AI
async function getAIResponse(question) {
    // החזרת תשובת דמה זמנית
    log(`[Help AI] שאלה שהתקבלה: ${question}`);
    
    // נשתמש במודל מתקדם יותר
    // יש להטמיע כאן את קריאת ה-API למודל כמו Gemini או GPT-4
    
    return `קיבלתי את שאלתך: \"${question}\".
    
    כרגע אני עוד לומד את כל פקודות השרת, אבל בקרוב אוכל לענות לך תשובות חכמות ומדויקות על כל שאלה!`;
}

module.exports = {
    customId: 'help_ai_submit', // ה-ID שהוגדר במודאל
    type: 'isModalSubmit', 
    
    async execute(interaction) {
        try {
            const question = interaction.fields.getTextInputValue('ai_question_input');
            await interaction.deferReply({ ephemeral: true });

            // קריאה לפונקציית ה-AI
            const response = await getAIResponse(question);

            await interaction.editReply({
                content: `**השאלה שלך:**\n> ${question}\n\n**🤖 התשובה של שמעון:**\n${response}`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            log(`❌ [Help AI] שגיאה בטיפול בשליחת מודאל:`, error);
            await interaction.editReply({ content: '❌ אירעה שגיאה בטיפול בשאלת ה־AI.', flags: MessageFlags.Ephemeral });
        }
    }
};
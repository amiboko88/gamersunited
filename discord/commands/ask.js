const { SlashCommandBuilder } = require('discord.js');
const brain = require('../../handlers/ai/brain'); // ✅ נתיב מתוקן
const { log } = require('../../utils/logger'); // ✅ נתיב מתוקן

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('שאל את שמעון שאלה')
        .addStringOption(option => 
            option.setName('question')
                .setDescription('מה תרצה לשאול?')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();
        const question = interaction.options.getString('question');
        
        try {
            // שליחה למוח המרכזי (בדיוק כמו שהיה)
            const answer = await brain.ask(interaction.user.id, 'discord', question);
            await interaction.editReply(answer);
        } catch (error) {
            log(`Ask Command Error: ${error.message}`);
            await interaction.editReply('המוח שלי עמוס כרגע. נסה שוב.');
        }
    }
};
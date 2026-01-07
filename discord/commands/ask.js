// 📁 commands/ask.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const shimonBrain = require('../handlers/ai/brain');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('שמעון')
        .setDescription('שאל את שמעון כל שאלה שבא לך')
        .addStringOption(option =>
            option.setName('שאלה')
                .setDescription('מה תרצה לשאול?')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply(); // AI לוקח זמן, אז אנחנו מודיעים שאנחנו חושבים

        const question = interaction.options.getString('שאלה');
        const userId = interaction.user.id;
        const isAdmin = interaction.member.permissions.has('Administrator');

        try {
            // קריאה למוח החדש
            const answer = await shimonBrain.ask(userId, 'discord', question, isAdmin);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31') // צבע נקי
                .setTitle(`🗣️ ${question}`) // השאלה בכותרת
                .setDescription(answer)      // התשובה בגוף
                .setFooter({ text: 'Shimon AI 2026', iconURL: interaction.client.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({ content: '❌ המוח שלי עשה ריסטרט. נסה שוב.' });
        }
    }
};
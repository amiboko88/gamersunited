// 📁 discord/commands/dj.js
const { SlashCommandBuilder } = require('discord.js');
const audioInteraction = require('../../handlers/audio/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dj')
        .setDescription('🎧 פתיחת קונסולת ה-DJ של שמעון (מוזיקה ואפקטים)'),

    async execute(interaction) {
        await audioInteraction.showConsole(interaction);
    }
};
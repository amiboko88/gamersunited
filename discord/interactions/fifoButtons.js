// 📁 interactions/fifoButtons.js
const fifoManager = require('../handlers/fifo/manager');

module.exports = {
    customId: (interaction) => interaction.customId.startsWith('fifo_'),
    
    async execute(interaction) {
        // כפתור אדום ראשי (חזרה ללובי)
        if (interaction.customId === 'fifo_return_lobby') {
            const session = fifoManager.activeSessions.get(interaction.guild.id);
            if (session) {
                await interaction.reply({ content: '🚨 מבצע איפוס וחזרה ללובי...', ephemeral: true });
                await fifoManager.resetSession(interaction.guild, session);
            } else {
                await interaction.reply({ content: '❌ הסשן לא נמצא או כבר נמחק.', ephemeral: true });
            }
            return;
        }

        // כפתור הצבעה קבוצתי
        if (interaction.customId.startsWith('fifo_vote_')) {
            const teamName = interaction.customId.replace('fifo_vote_', '');
            const result = await fifoManager.handleVote(interaction, teamName);

            if (result.status === 'already_voted') {
                return interaction.reply({ content: '❌ כבר הצבעת.', ephemeral: true });
            }
            
            if (result.status === 'voted') {
                if (result.passed) {
                    await interaction.reply(`✅ **${teamName}** הצביעה בעד ריפליי! כולם חוזרים ללובי.`);
                    // הפעלת האיפוס המלא
                    await fifoManager.resetSession(interaction.guild, result.session);
                } else {
                    await interaction.reply({ content: `🗳️ הצבעתך נקלטה (${result.count}/${Math.ceil(result.needed / 2)})`, ephemeral: true });
                }
            }
        }
    }
};
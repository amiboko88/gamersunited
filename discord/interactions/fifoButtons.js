// 📁 discord/interactions/fifoButtons.js
// ✅ תיקון קריטי: יציאה כפולה (../../) כדי להגיע לתיקייה הראשית
const fifoManager = require('../../handlers/fifo/manager');
const { log } = require('../../utils/logger');

module.exports = {
    name: 'fifoButtons',
    async execute(interaction) {
        if (!interaction.isButton()) return;
        
        const { customId } = interaction;

        // 1. כפתור הצבעה ל-Replay (מתוך ערוצי הקבוצות)
        if (customId.startsWith('fifo_vote_')) {
            // חייב defer כדי לא לקרוס אם הלוגיקה לוקחת רגע
            await interaction.deferReply({ ephemeral: true });
            
            const teamName = customId.replace('fifo_vote_', '');
            
            try {
                const result = await fifoManager.handleVote(interaction, teamName);

                if (result.status === 'expired') {
                    return interaction.editReply('❌ המשחק הזה כבר לא פעיל.');
                }

                if (result.status === 'already_voted') {
                    return interaction.editReply('⚠️ כבר הצבעת! לא צריך ללחוץ פעמיים.');
                }

                if (result.status === 'voted') {
                    await interaction.editReply(`✅ הצבעתך נקלטה! (${result.count}/${result.needed} הצבעות דרושות)`);
                    
                    // אם הושג רוב - מבצעים ריפליי
                    if (result.passed) {
                        await interaction.channel.send(`🚨 **רוב הקבוצה הצביע לריפליי!** מחזיר את כולם ללובי...`);
                        // קריאה לפונקציה שמחזירה את כולם
                        await fifoManager.resetSession(interaction.guild, result.session);
                    }
                }
            } catch (error) {
                log(`❌ Error in vote handler: ${error.message}`);
                await interaction.editReply('❌ אירעה שגיאה בעיבוד ההצבעה.');
            }
        }

        // 2. כפתור חזרה ללובי (הכפתור האדום הגדול בהודעת הסיכום)
        if (customId === 'fifo_return_lobby') {
            try {
                await fifoManager.reset(interaction);
            } catch (error) {
                log(`❌ Error in reset handler: ${error.message}`);
                // מנסה להגיב רק אם עדיין לא הגיבו
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ תקלה באיפוס המשחק.', ephemeral: true });
                }
            }
        }
    }
};
// 📁 discord/events/interactionCreate.js
const { MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger'); 

// ייבוא המטפלים (Handlers)
const musicController = require('../../handlers/music/controller');
const verifyButton = require('../../handlers/users/verification'); 
const fifoButtons = require('../interactions/fifoButtons'); 

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // 1. טיפול בפקודות סלאש
            if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                if (interaction.isAutocomplete()) {
                    await command.autocomplete(interaction);
                } else {
                    await command.execute(interaction);
                }
                return;
            }

            // 2. טיפול בכפתורים (Buttons)
            if (interaction.isButton()) {
                const { customId } = interaction;

                // מוזיקה
                if (musicController.isMusicButton(customId)) {
                    await musicController.execute(interaction);
                    return;
                }

                // FIFO
                if (customId.startsWith('fifo_')) {
                    await fifoButtons.execute(interaction);
                    return;
                }

                // אימות
                if (customId === 'verify_btn') {
                    await verifyButton.verifyUser(interaction.member, 'button');
                    return;
                }
            }

        } catch (error) {
            log(`❌ Interaction Error: ${error.message}`);
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.reply({ content: '❌ שגיאה פנימית.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
};
// 📁 discord/events/interactionCreate.js
const { Events, MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger');

// ייבוא המטפלים (Handlers)
const verificationHandler = require('../../handlers/users/verification');
const handleMusicControls = require('../../discord/interactions/buttons/music_controls');
const handleFifoButtons = require('../../discord/interactions/fifoButtons');
const dashboardHandler = require('../../handlers/users/dashboard'); // ✅ התוספת החדשה

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // -----------------------------------------
            // 1. טיפול בפקודות (Slash Commands)
            // -----------------------------------------
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);

                if (!command) {
                    console.warn(`[Command] No command matching ${interaction.commandName} was found.`);
                    return;
                }

                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(`Error executing ${interaction.commandName}:`, error);
                    const msg = { content: '❌ אירעה שגיאה בביצוע הפקודה.', flags: MessageFlags.Ephemeral };
                    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
                    else await interaction.reply(msg);
                }
            }

            // -----------------------------------------
            // 2. טיפול בכפתורים (Buttons)
            // -----------------------------------------
            else if (interaction.isButton()) {
                const id = interaction.customId;

                // --- אימות ---
                if (id === 'start_verification_process') {
                    await verificationHandler.showVerificationModal(interaction);
                }
                
                // --- ניהול ודשבורד (חדש!) ---
                else if (id === 'btn_manage_refresh') {
                    await interaction.deferUpdate(); // מונע שגיאת אינטראקציה
                    await dashboardHandler.showMainDashboard(interaction);
                }
                else if (id === 'btn_manage_kick_prep') {
                    await dashboardHandler.showKickCandidateList(interaction);
                }
                else if (id === 'btn_manage_kick_confirm') {
                    await dashboardHandler.executeKick(interaction);
                }
                else if (id === 'btn_manage_cancel') {
                    await interaction.update({ content: '✅ הפעולה בוטלה.', embeds: [], components: [], files: [] });
                }

                // --- מוזיקה ---
                else if (['play_pause', 'skip', 'stop', 'loop', 'shuffle', 'lyrics'].includes(id)) {
                    await handleMusicControls.execute(interaction);
                }

                // --- פיפו (הצבעות) ---
                else if (id.startsWith('fifo_vote_') || id === 'fifo_replay') {
                    await handleFifoButtons.execute(interaction);
                }
            }

            // -----------------------------------------
            // 3. טיפול בטפסים (Modals)
            // -----------------------------------------
            else if (interaction.isModalSubmit()) {
                const id = interaction.customId;

                if (id === 'verification_modal_submit') {
                    await verificationHandler.handleModalSubmit(interaction);
                }
            }

        } catch (error) {
            log(`[Interaction Error] ${error.message}`);
        }
    }
};
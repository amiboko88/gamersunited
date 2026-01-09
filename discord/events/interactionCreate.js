// 📁 discord/events/interactionCreate.js
const { Events, MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger');

// ייבוא המטפלים (Handlers)
const verificationHandler = require('../../handlers/users/verification');
const handleFifoButtons = require('../../discord/interactions/fifoButtons');
const dashboardHandler = require('../../handlers/users/dashboard');
const birthdayHandler = require('../../handlers/birthday/interaction');
const audioHandler = require('../../handlers/audio/interaction'); // ✅ [PLANT] המטפל החדש ל-DJ

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
            // 2. טיפול בכפתורים ובתפריטים (Buttons & Menus)
            // -----------------------------------------
            // ✅ [UPDATE] הוספנו תמיכה ב-SelectMenu עבור ה-DJ
            else if (interaction.isButton() || interaction.isStringSelectMenu()) {
                const id = interaction.customId;

                // ✅ [PLANT] מערכת ה-DJ החדשה (תפריטים וכפתורים)
                if (id.startsWith('audio_')) {
                    if (id === 'audio_main_menu') await audioHandler.handleMenuSelection(interaction);
                    else if (id.startsWith('audio_play_')) await audioHandler.handleFilePlay(interaction);
                    else if (id.startsWith('audio_ctrl_')) await audioHandler.handleControls(interaction);
                }

                // --- ימי הולדת (מערכת חדשה) ---
                else if (['btn_bd_set', 'btn_bd_edit', 'btn_bd_admin_panel', 'btn_bd_remind_all'].includes(id)) {
                    if (id === 'btn_bd_set' || id === 'btn_bd_edit') await birthdayHandler.showModal(interaction);
                    else if (id === 'btn_bd_admin_panel') await birthdayHandler.showAdminPanel(interaction);
                    else if (id === 'btn_bd_remind_all') await birthdayHandler.sendReminders(interaction);
                }

                // --- ניהול ודשבורד ---
                else if (id === 'btn_manage_refresh') {
                    await interaction.deferUpdate();
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

                // --- אימות ---
                else if (id === 'start_verification_process') {
                    await verificationHandler.showVerificationModal(interaction);
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

                // --- ימי הולדת ---
                if (id === 'modal_bd_submit') {
                    await birthdayHandler.handleModalSubmit(interaction);
                }
                
                // --- אימות ---
                else if (id === 'verification_modal_submit') {
                    await verificationHandler.handleModalSubmit(interaction);
                }
            }

        } catch (error) {
            log(`[Interaction Error] ${error.message}`);
        }
    }
};
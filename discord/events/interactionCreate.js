// 📁 discord/events/interactionCreate.js
const { Events, MessageFlags } = require('discord.js');
const { log } = require('../../utils/logger');

// ייבוא המטפלים (Handlers) השונים
const verificationHandler = require('../../handlers/users/verification'); // ✅ אימות
const handleMusicControls = require('../../discord/interactions/buttons/music_controls'); // מוזיקה
const handleFifoButtons = require('../../discord/interactions/fifoButtons'); // פיפו

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
                    console.error(`[Error] No command matching ${interaction.commandName} was found.`);
                    return;
                }

                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(`Error executing ${interaction.commandName}`);
                    console.error(error);
                    const replyContent = { content: '❌ אירעה שגיאה בביצוע הפקודה.', flags: MessageFlags.Ephemeral };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(replyContent);
                    } else {
                        await interaction.reply(replyContent);
                    }
                }
            }

            // -----------------------------------------
            // 2. טיפול בכפתורים (Buttons)
            // -----------------------------------------
            else if (interaction.isButton()) {
                const id = interaction.customId;

                // א. כפתור האימות הראשי (מה-Banner)
                if (id === 'start_verification_process') {
                    await verificationHandler.showVerificationModal(interaction);
                }
                
                // ב. כפתורי מוזיקה (Music Controls)
                else if (['play_pause', 'skip', 'stop', 'loop', 'shuffle', 'lyrics'].includes(id)) {
                    await handleMusicControls.execute(interaction);
                }

                // ג. כפתורי פיפו (Vote / Replay)
                else if (id.startsWith('fifo_vote_') || id === 'fifo_replay') {
                    await handleFifoButtons.execute(interaction);
                }
                
                // ד. כפתור הוספת יום הולדת (מהסלאש הישן אם קיים)
                else if (id === 'birthday_add') {
                     // אם נשאר כפתור כזה, אפשר להפנות אותו למודאל של האימות או למודאל נפרד
                     // כרגע המודאל באימות מטפל בזה, אז נשאיר אופציונלי
                }
            }

            // -----------------------------------------
            // 3. טיפול בטפסים (Modals)
            // -----------------------------------------
            else if (interaction.isModalSubmit()) {
                const id = interaction.customId;

                // א. סיום טופס אימות
                if (id === 'verification_modal_submit') {
                    await verificationHandler.handleModalSubmit(interaction);
                }
                
                // ב. טופס פתיחת טיקט / DM (אם קיים)
                else if (id === 'dm_fallback_modal') {
                     // לוגיקה לטיפול ב-DM אם תחזיר אותה בעתיד
                }
            }

        } catch (error) {
            log(`[Interaction Error] ${error.message}`);
        }
    }
};
// 📁 handlers/interactionHandler.js
const { MessageFlags } = require('discord.js');

// ייבוא כל המטפלים (Handlers)
const handleMusicControls = require('./musicControls');
const memberButtons = require('./memberButtons');
const { handleBirthdayPanel, showBirthdayModal, handleBirthdayModalSubmit } = require('./birthdayPanelHandler');
const { handleDmFallbackModalSubmit } = require('./dmFallbackModal');
const recordingsPanel = require('../commands/recordingsPanel'); // שים לב לנתיב
const helpAiSubmit = require('../interactions/modals/help_ai_submit');
const helpPanel = require('../interactions/help_panel');
const repartition = require('../interactions/buttons/repartition');
const helpAiModal = require('../interactions/buttons/help_ai_modal');
const verifyButton = require('../interactions/buttons/verify');

/**
 * הנתב הראשי של האינטראקציות
 */
async function handleInteractions(interaction, client) {
    try {
        // 1. טיפול בכפתורים (Buttons)
        if (interaction.isButton()) {
            const { customId } = interaction;

            // מוזיקה
            if (['pause', 'resume', 'stop', 'new_song'].includes(customId)) {
                await handleMusicControls(interaction);
                return;
            }

            // אימות (Verify)
            if (customId === 'start_verification_process' || customId === 'verify') {
                await verifyButton.execute(interaction, client);
                return;
            }

            // יום הולדת
            if (customId.startsWith('bday_') || customId === 'open_birthday_modal') {
                if (customId === 'open_birthday_modal' || customId === 'bday_add') {
                    await showBirthdayModal(interaction);
                } else {
                    // כפתורים אחרים של יום הולדת (כמו TTS)
                    // הנחה: הם מטופלים בתוך birthdayPanelHandler או שצריך להפנות ל-Congratulator
                    const { handlePlayBirthdayTTS } = require('./birthdayCongratulator');
                    if (customId.startsWith('bday_play_tts_')) {
                        await handlePlayBirthdayTTS(interaction);
                    } else {
                        await handleBirthdayPanel(interaction, client);
                    }
                }
                return;
            }

            // חלוקת קבוצות (FIFO)
            if (customId === 'repartition_now') {
                await repartition.execute(interaction);
                return;
            }

            // כפתורי עזרה (AI / מעבר פאנלים)
            if (helpPanel.customId(interaction)) {
                await helpPanel.execute(interaction);
                return;
            }
            if (helpAiModal.customId(interaction)) {
                await helpAiModal.execute(interaction);
                return;
            }

            // כפתורי ניהול משתמשים (Member Buttons - Kick/Warn)
            if (memberButtons.customId(interaction)) {
                await memberButtons.execute(interaction, client);
                return;
            }
            
            // פאנל הקלטות
            if (recordingsPanel.customId && recordingsPanel.customId(interaction)) {
                await recordingsPanel.handleInteraction(interaction, client);
                return;
            }
        }

        // 2. טיפול ב-Modals (טפסים)
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'birthday_modal') {
                await handleBirthdayModalSubmit(interaction);
            } 
            else if (interaction.customId === 'dm_fallback_modal') {
                await handleDmFallbackModalSubmit(interaction, client);
            }
            else if (interaction.customId === 'help_ai_submit') {
                await helpAiSubmit.execute(interaction);
            }
            return;
        }

        // 3. טיפול בתפריטי בחירה (Select Menus)
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'birthday_action_select') {
                await handleBirthdayPanel(interaction, client);
            }
            else if (interaction.customId === 'inactivity_action_select') {
                // מפנה ל-memberButtons שמטפל גם בזה
                await memberButtons.execute(interaction, client);
            }
            else if (interaction.customId === 'select_voice') {
                await recordingsPanel.handleInteraction(interaction, client);
            }
            return;
        }

    } catch (error) {
        console.error('❌ Critical Interaction Error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ שגיאה פנימית במערכת.', flags: MessageFlags.Ephemeral });
        }
    }
}

module.exports = { handleInteractions };
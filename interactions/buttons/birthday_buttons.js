// 📁 interactions/buttons/birthday_buttons.js (משודרג)
const { MessageFlags } = require('discord.js'); 
const { handleBirthdayPanel, showBirthdayModal } = require('../../handlers/birthdayPanelHandler'); 
// --- ✅ [שדרוג] ייבוא ה-handler החדש לברכה קולית ---
const { handlePlayBirthdayTTS } = require('../../handlers/birthdayCongratulator');

/**
 * פונקציית customId דינמית שמזהה את כל הכפתורים של מערכת יום ההולדת.
 */
const customId = (interaction) => {
    // בודק אם ה-ID מתחיל באחד מהקידומות המוכרות
    return interaction.customId.startsWith('bday_') || 
           interaction.customId === 'open_birthday_modal';
};

/**
 * פונקציית execute לטיפול בכלל לחיצות הכפתורים של מערכת יום ההולדת.
 */
const execute = async (interaction, client) => {
    try {
        const customId = interaction.customId;

        // --- ✅ [שדרוג] ניתוב חכם לפי סוג הכפתור ---
        if (customId.startsWith('bday_play_tts_')) {
            // אם זה כפתור הברכה הקולית, הפעל את ה-handler החדש
            await handlePlayBirthdayTTS(interaction);
        } else if (customId === 'bday_add' || customId === 'open_birthday_modal') {
            // אם זה כפתור לפתיחת מודאל, הפעל את הפונקציה המתאימה
            await showBirthdayModal(interaction);
        } else {
            // לכל שאר הכפתורים הישנים (שכבר לא בשימוש), השארנו את הטיפול הכללי
            await handleBirthdayPanel(interaction, client);
        }

    } catch (error) {
        console.error('❌ שגיאה ב-birthday_buttons:', error);
        const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', flags: MessageFlags.Ephemeral };
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        } catch (e) {
            console.error("שגיאה נוספת בניסיון להשיב על שגיאה:", e);
        }
    }
};

module.exports = {
    customId,
    execute,
};
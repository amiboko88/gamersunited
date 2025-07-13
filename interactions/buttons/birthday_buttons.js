// 📁 interactions/buttons/birthday_buttons.js (מעודכן לטפל בכפתורי יום הולדת)
const { PermissionFlagsBits, MessageFlags } = require('discord.js'); 
const { handleBirthdayPanel } = require('../../handlers/birthdayPanelHandler'); 

/**
 * פונקציית customId עבור הכפתורים הקשורים לימי הולדת.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @returns {boolean}
 */
const customId = (interaction) => {
  // ✅ עכשיו יטפל רק בכפתורים בפועל
  return interaction.customId === 'bday_list' || // לחצן רשימה (ישן, כעת בסלקטור) - אם עדיין מופיע
         interaction.customId === 'bday_next' || // לחצן הבא (ישן, כעת בסלקטור) - אם עדיין מופיע
         interaction.customId === 'bday_add' || // לחצן הוספה (חדש, כפתור מהיר)
         interaction.customId === 'open_birthday_modal' || // לחיצה על כפתור פתיחת מודל (מתזכורת שבועית)
         interaction.customId === 'bday_missing' || // לחצן חסרים (ישן, כעת בסלקטור) - אם עדיין מופיע
         interaction.customId === 'bday_remind_missing'; // לחצן תזכורת (ישן, כעת בסלקטור) - אם עדיין מופיע
};

/**
 * פונקציית execute לטיפול בלחיצות כפתורים הקשורות לימי הולדת.
 * @param {import('discord.js').ButtonInteraction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
const execute = async (interaction, client) => {
  try {
    await handleBirthdayPanel(interaction, client);

  } catch (error) {
    console.error('❌ שגיאה ב-birthday_buttons:', error);
    const replyOptions = { content: '❌ אירעה שגיאה בביצוע פעולת יום ההולדת.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
    } else {
        await interaction.reply(replyOptions).catch(() => {});
    }
  }
};

module.exports = {
  customId,
  execute,
};
// 📁 interactions/selectors/birthdaySelectMenuHandler.js
const { MessageFlags } = require('discord.js');
const { handleBirthdayPanel } = require('../../handlers/birthdayPanelHandler'); // ✅ ייבוא handler יום ההולדת הראשי

/**
 * מגדיר את ה-customId הדינמי עבור ה-handler הזה.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @returns {boolean}
 */
const customId = (interaction) => {
  return interaction.customId === 'birthday_action_select';
};

/**
 * פונקציית execute לטיפול בבחירות מתוך תפריט ימי ההולדת.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
const execute = async (interaction, client) => {
  try {
    // הפנה את הטיפול לפונקציה המרכזית ב-handlers/birthdayPanelHandler.js
    // handleBirthdayPanel יודע לטפל גם באינטראקציות של Select Menu
    await handleBirthdayPanel(interaction, client);

  } catch (error) {
    console.error('❌ שגיאה ב-birthdaySelectMenuHandler:', error);
    const replyOptions = { content: '❌ אירעה שגיאה בביצוע פעולת יום ההולדת (בחירה).', flags: MessageFlags.Ephemeral };
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
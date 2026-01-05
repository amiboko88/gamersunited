// 📁 handlers/memberButtons.js
const { MessageFlags } = require('discord.js');
const { sendStaffLog } = require('../utils/staffLogger');

// ייבוא מודולי האינטראקציות הספציפיים
const inactivityDmButtons = require('../interactions/buttons/inactivityDmButtons');
const inactivityKickButton = require('../interactions/buttons/inactivityKickButton');
const inactivitySelectMenuHandler = require('../interactions/selectors/inactivitySelectMenuHandler');

/**
 * מגדיר את ה-customId הדינמי עבור ה-handler הזה.
 */
const customId = (interaction) => {
  if (interaction.isButton()) {
    return inactivityDmButtons.customId(interaction) ||
           inactivityKickButton.customId(interaction);
  }
  if (interaction.isStringSelectMenu()) {
    return inactivitySelectMenuHandler.customId(interaction);
  }
  return false;
};

/**
 * פונקציה ראשית לטיפול באינטראקציות כפתורים ותפריטי בחירה של ניהול משתמשים.
 * שונה השם ל-execute כדי להתאים לסטנדרט של ה-Handler הראשי.
 */
async function execute(interaction, client) {
  try {
    // לוג דיבאג לראות איזו פעולה נכנסה
    // console.log(`[MemberButtons] Handling interaction: ${interaction.customId}`);

    if (interaction.isButton()) {
      if (inactivityDmButtons.customId(interaction)) {
        await inactivityDmButtons.execute(interaction, client);
      } else if (inactivityKickButton.customId(interaction)) {
        await inactivityKickButton.execute(interaction, client);
      } else {
        console.warn(`[MemberButtons] ⚠️ כפתור לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור כפתור זה.', flags: MessageFlags.Ephemeral });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (inactivitySelectMenuHandler.customId(interaction)) {
        await inactivitySelectMenuHandler.execute(interaction, client);
      } else {
        console.warn(`[MemberButtons] ⚠️ תפריט בחירה לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור תפריט בחירה זה.', flags: MessageFlags.Ephemeral });
      }
    } else {
      await interaction.reply({ content: 'סוג אינטראקציה לא נתמך עבור לוח זה.', flags: MessageFlags.Ephemeral });
      await sendStaffLog('⚠️ סוג אינטראקציה לא נתמך', `סוג אינטראקציה לא נתמך ב-memberButtons: \`${interaction.type}\`.`, 0xFFA500);
    }
  } catch (error) {
    console.error('❌ שגיאה ב-memberButtons:', error);
    const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
    } else {
        await interaction.reply(replyOptions).catch(() => {});
    }
  }
}

module.exports = {
  execute, // ✅ עכשיו זה תואם לקריאה ב-interactionHandler
  customId,
};
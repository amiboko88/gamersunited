// 📁 handlers/memberButtons.js (הגרסה המפושטת והמעודכנת)
const { MessageFlags } = require('discord.js'); // נחוץ עבור MessageFlags.Ephemeral
const { sendStaffLog } = require('../utils/staffLogger'); // נתיב יחסי נכון

// ייבוא מודולי האינטראקציות הספציפיים
const inactivityDmButtons = require('../interactions/buttons/inactivityDmButtons');
const inactivityKickButton = require('../interactions/buttons/inactivityKickButton');
const inactivitySelectMenuHandler = require('../interactions/selectors/inactivitySelectMenuHandler');

// ייבוא פונקציות ה-CRON שנותרו בתיקיית handlers, מכיוון שהן לא קשורות לכפתורים/מודלים/selectors
// (אלה יובאו כעת מ-handlers/inactivityCronJobs.js ב-botLifecycle)

/**
 * מגדיר את ה-customId הדינמי עבור ה-handler הזה.
 * יוחזר true אם האינטראקציה מתאימה לאחד מהמזהים של ה-handlers המנוהלים כאן.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @returns {boolean} - האם האינטראקציה צריכה להיות מטופלת על ידי handler זה.
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
 * זוהי נקודת ניתוב, היא מאצילה את הטיפול ל-handlers הספציפיים.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function handleMemberButtons(interaction, client) {
  try {
    if (interaction.isButton()) {
      if (inactivityDmButtons.customId(interaction)) {
        await inactivityDmButtons.execute(interaction, client);
      } else if (inactivityKickButton.customId(interaction)) {
        await inactivityKickButton.execute(interaction, client);
      } else {
        console.warn(`[handleMemberButtons] ⚠️ כפתור לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור כפתור זה.', flags: MessageFlags.Ephemeral });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (inactivitySelectMenuHandler.customId(interaction)) {
        await inactivitySelectMenuHandler.execute(interaction, client);
      } else {
        console.warn(`[handleMemberButtons] ⚠️ תפריט בחירה לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור תפריט בחירה זה.', flags: MessageFlags.Ephemeral });
      }
    } else {
      await interaction.reply({ content: 'סוג אינטראקציה לא נתמך עבור לוח זה.', flags: MessageFlags.Ephemeral });
      await sendStaffLog(client, '⚠️ סוג אינטראקציה לא נתמך', `סוג אינטראקציה לא נתמך ב-handleMemberButtons: \`${interaction.type}\`.`, 0xFFA500);
    }
  } catch (error) {
    console.error('❌ שגיאה ב-handleMemberButtons:', error);
    const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
    } else {
        await interaction.reply(replyOptions).catch(() => {});
    }
  }
}

module.exports = {
  handleMemberButtons,
  customId,
};
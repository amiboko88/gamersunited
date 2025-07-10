// 📁 handlers/memberButtons.js (הגרסה המפושטת והמעודכנת)
const { sendStaffLog } = require('../utils/staffLogger'); // נתיב יחסי נכון ל-staffLogger.js

// ייבוא מודולי האינטראקציות הספציפיים
const inactivityDmButtons = require('../interactions/buttons/inactivityDmButtons');
const inactivityKickButton = require('../interactions/buttons/inactivityKickButton');
const inactivitySelectMenuHandler = require('../interactions/selectors/inactivitySelectMenuHandler');

// ייבוא פונקציות ה-CRON שנותרו בתיקיית handlers, מכיוון שהן לא קשורות לכפתורים/מודלים/selectors
// ונשארות תחת אחריות handlers
const { startAutoTrackingLogic } = require('./botLifecycle'); // נניח שזו נקודת הכניסה החדשה ל-autoTracking
const { sendMonthlyKickReportCron } = require('./botLifecycle'); // נניח שזו נקודת הכניסה החדשה ל-monthlyReport
const { sendScheduledRemindersLogic } = require('./botLifecycle'); // נניח שזו נקודת הכניסה החדשה ל-dmSender cron job


/**
 * מגדיר את ה-customId הדינמי עבור ה-handler הזה.
 * יוחזר true אם האינטראקציה מתאימה לאחד מהמזהים של ה-handlers המנוהלים כאן.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @returns {boolean} - האם האינטראקציה צריכה להיות מטופלת על ידי handler זה.
 */
const customId = (interaction) => {
  // אם זו אינטראקציית כפתור, בדוק אם ה-customId שלה מטופל על ידי כפתורי ה-DM או כפתור ה-Kick.
  if (interaction.isButton()) {
    return inactivityDmButtons.customId(interaction) ||
           inactivityKickButton.customId(interaction);
  }
  // אם זו אינטראקציית StringSelectMenu, בדוק אם ה-customId שלה מטופל על ידי ה-select menu של אי-פעילות.
  if (interaction.isStringSelectMenu()) {
    return inactivitySelectMenuHandler.customId(interaction);
  }
  // אם סוג האינטראקציה אינו רלוונטי ל-handler זה.
  return false;
};

/**
 * פונקציה ראשית לטיפול באינטראקציות כפתורים ותפריטי בחירה של ניהול משתמשים.
 * זוהי נקודת ניתוב, היא מאצילה את הטיפול ל-handlers הספציפיים.
 * @param {import('discord.js').Interaction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function handleMemberButtons(interaction, client) {
  // אין צורך ב-deferReply כאן אם ה-handlers הפנימיים מבצעים זאת.
  // אנו נסמוך על ה-handlers הספציפיים לבצע deferReply.

  try {
    if (interaction.isButton()) {
      // אם זו אינטראקציית כפתור, נשלח ל-handler הרלוונטי
      if (inactivityDmButtons.customId(interaction)) {
        await inactivityDmButtons.execute(interaction, client);
      } else if (inactivityKickButton.customId(interaction)) {
        await inactivityKickButton.execute(interaction, client);
      } else {
        // אם הגיע לכאן, זה כפתור שלא זוהה על ידי ה-handlers הפנימיים אך תאם ל-customId הראשי
        // זה לא אמור לקרות אם ה-customId הראשי מדויק
        console.warn(`[handleMemberButtons] ⚠️ כפתור לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור כפתור זה.', ephemeral: true });
      }
    } else if (interaction.isStringSelectMenu()) {
      // אם זו אינטראקציית StringSelectMenu, נשלח ל-handler הרלוונטי
      if (inactivitySelectMenuHandler.customId(interaction)) {
        await inactivitySelectMenuHandler.execute(interaction, client);
      } else {
        console.warn(`[handleMemberButtons] ⚠️ תפריט בחירה לא ידוע הופעל: ${interaction.customId}`);
        await interaction.reply({ content: 'פעולה לא ידועה עבור תפריט בחירה זה.', ephemeral: true });
      }
    } else {
      // אם סוג האינטראקציה אינו נתמך על ידי handler זה
      await interaction.reply({ content: 'סוג אינטראקציה לא נתמך עבור לוח זה.', ephemeral: true });
      await sendStaffLog(client, '⚠️ סוג אינטראקציה לא נתמך', `סוג אינטראקציה לא נתמך ב-handleMemberButtons: \`${interaction.type}\`.`, 0xFFA500);
    }
  } catch (error) {
    console.error('❌ שגיאה ב-handleMemberButtons:', error);
    const replyOptions = { content: '❌ אירעה שגיאה בביצוע הפעולה.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
    } else {
        await interaction.reply(replyOptions).catch(() => {});
    }
  }
}

module.exports = {
  handleMemberButtons,
  customId, // ייצוא customId כפונקציה
  // אין צורך לייצא כאן את פונקציות ה-CRON או פונקציות עזר אחרות,
  // מכיוון שהן מיוצאות מקבצים אחרים ונקראות ישירות מ-botLifecycle
  // או שהן פונקציות פנימיות למודולים שלהן.
  // רק הפונקציות הנחוצות ל-index.js (handleMemberButtons ו-customId) נשארות.

  // פונקציות CRON - חשוב: יש לוודא שהן מיוצאות מהמקום הנכון עבור botLifecycle
  // ואז להסיר אותן מה-memberButtons.js לחלוטין.
  // אם הן כבר לא מיוצאות מ-memberButtons.js, אז לא צריך להכניס אותן ל-module.exports.
  // הנחתי שהן מועברות ל-botLifecycle.js כנקודת כניסה (כפי שהיה בהצעת הפיצול הקודמת לבוט לייפסייקל).
};
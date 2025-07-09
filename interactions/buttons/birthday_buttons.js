// 📁 interactions/buttons/birthday_buttons.js
const handleBirthdayPanel = require('../../handlers/birthdayPanelHandler');

// מערך של כל ה-IDs של הכפתורים בפאנל
const birthdayButtonIds = [
  'bday_list',
  'bday_next',
  'bday_add',
  'bday_missing',
  'bday_remind_missing',
  'open_birthday_modal' // הוספתי גם את זה, הוא שייך לאותה לוגיקה
];

module.exports = {
  // הפונקציה בודקת אם ה-ID הוא אחד מכפתורי הפאנל
  customId: (id) => birthdayButtonIds.includes(id),
  type: 'isButton',

  async execute(interaction, client) {
    // ההנדלר המקורי יודע לטפל בכל הכפתורים האלה
    await handleBirthdayPanel(interaction);
  }
};
// 📁 interactions/member_buttons.js
const { handleMemberButtons } = require('../handlers/memberButtons');

// רשימת ה-IDs הקבועים של הכפתורים והתפריטים במערכת
const memberInteractionIds = [
  'send_dm_batch_list',
  'send_dm_batch_final_check',
  'show_failed_list',
  'show_replied_list',
  'kick_failed_users',
  'inactivity_action_select',
  'show_status_summary' // הוספתי גם את זה מהקובץ המקורי
];

module.exports = {
  // הפונקציה בודקת אם האינטראקציה שייכת למערכת ניהול המשתמשים
  customId: (interaction) => {
    const id = interaction.customId;
    return memberInteractionIds.includes(id) || 
           id.startsWith('send_dm_again_') || 
           id.startsWith('send_final_dm_') ||
           id.startsWith('inactive_');
  },

  async execute(interaction, client) {
    // כל האינטראקציות האלה מטופלות על ידי אותו הנדלר
    await handleMemberButtons(interaction, client);
  }
};
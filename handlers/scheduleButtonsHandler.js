// 📁 handlers/scheduleButtonsHandler.js
const rsvpCounts = {}; // זה יישמר בזיכרון. אפשר לשדרג למסד נתונים אמיתי!

module.exports = async function handleRSVP(interaction) {
  const customId = interaction.customId;
  if (!customId.startsWith('like_')) return;

  // הגדל את מספר ההצבעות
  rsvpCounts[customId] = (rsvpCounts[customId] || 0) + 1;

  // הודעה מהירה למצביע
  const dayMap = {
    like_sunday: 'ראשון',
    like_monday: 'שני',
    like_tuesday: 'שלישי',
    like_wednesday: 'רביעי',
    like_thursday: 'חמישי',
    like_saturday: 'שבת',
    like_all: 'כל השבוע'
  };

  await interaction.reply({
    content: `🔥 נספרת כהצבעה ל**${dayMap[customId] || 'פעילות'}**! נתראה על המפה 🚀`,
    ephemeral: true
  });

  // אפשר להוסיף כאן עדכון ללוח, שליחת סקר חדש או ניהול RSVP אמיתי לפי הצורך!
};

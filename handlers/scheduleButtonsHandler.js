// 📁 handlers/scheduleButtonsHandler.js
const db = require('../utils/firebase');

const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שבת'];

module.exports = async function handleRSVP(interaction) {
  const userId = interaction.user.id;
  const displayName = interaction.member?.displayName || interaction.user.username;
  const customId = interaction.customId; // למשל: rsvp_2

  if (!customId.startsWith('rsvp_')) return;

  const dayIndex = parseInt(customId.replace('rsvp_', ''), 10);
  const dayLabel = WEEK_DAYS[dayIndex] || 'לא ידוע';

  // 🔐 שמירה ב־Firestore (הוספה לרשימת ההצבעות לאותו יום)
  const docRef = db.collection('rsvp').doc(dayLabel);
  await docRef.set({ [userId]: displayName }, { merge: true });

  // 🔔 תגובה פרטית
  await interaction.reply({
    content: `✅ נרשמת ליום **${dayLabel}**. תתכונן לקרב GAMERS UNITED IL! 🎮`,
    ephemeral: true
  });
};

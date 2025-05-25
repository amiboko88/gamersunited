// 📁 handlers/scheduleButtonsHandler.js
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/firebase'); // ✅ תיקון כאן

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']; // ✅ נוספה שבת

module.exports = async function handleRSVP(interaction, client) {
  const userId = interaction.user.id;
  const displayName = interaction.member?.displayName || interaction.user.username;
  const customId = interaction.customId; // למשל: rsvp_2

  const dayIndex = parseInt(customId.replace('rsvp_', ''), 10);
  const dayLabel = DAY_LABELS[dayIndex] || 'לא ידוע';

  // 🔐 שמירה ב־Firestore
  const docRef = db.collection('rsvp').doc(dayLabel);
  await docRef.set({
    [userId]: displayName
  }, { merge: true });

  // 🔔 תגובה פרטית
  await interaction.reply({
    content: `✅ נרשמת ליום **${dayLabel}**. נתראה בקרב 🎮`,
    ephemeral: true
  });
};

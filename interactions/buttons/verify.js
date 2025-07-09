// 📁 interactions/buttons/verify.js

// הפונקציה המקורית מתוך verificationButton.js
const { handleInteraction: handleVerifyInteraction } = require('../../handlers/verificationButton');

module.exports = {
  customId: 'verify', // ה-ID של הכפתור
  async execute(interaction, client) {
    // קוראים לפונקציה המקורית שמטפלת בלוגיקה
    await handleVerifyInteraction(interaction, client);
  }
};
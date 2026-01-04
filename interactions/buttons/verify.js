// 📁 interactions/buttons/verify.js

// ייבוא הפונקציה בשם החדש והנכון מתוך ה-Handler המתוקן
const { handleVerificationButton } = require('../../handlers/verificationButton');

module.exports = {
  customId: 'verify', // זה כנראה לא בשימוש כי ב-Handler הגדרנו 'start_verification_process', אבל נשאיר לתאימות לאחור
  
  async execute(interaction, client) {
    // הפנייה ללוגיקה המרכזית ב-handlers
    await handleVerificationButton(interaction, client);
  }
};
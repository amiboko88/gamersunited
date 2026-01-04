// 📁 telegram/birthdayNotifierTelegram.js
const db = require("../utils/firebase");
const { Bot } = require("grammy");
require("dotenv").config();

const bot = process.env.TELEGRAM_TOKEN ? new Bot(process.env.TELEGRAM_TOKEN) : null;

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function alreadySentToday() {
  const doc = await db.collection("system_metadata").doc("telegram_birthday_check").get();
  return doc.exists && doc.data().date === getTodayKey();
}

async function markAsSent() {
  await db.collection("system_metadata").doc("telegram_birthday_check").set({ date: getTodayKey() }, { merge: true });
}

/**
 * שולף ימי הולדת מה-DB המאוחד
 */
async function getTodaysBirthdays() {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;

  // שליפה חכמה מה-DB המאוחד
  const snapshot = await db.collection('users')
    .where('identity.birthday.day', '==', currentDay)
    .where('identity.birthday.month', '==', currentMonth)
    .get();

  const celebrants = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    // בדיקה אם למשתמש יש קישור לטלגרם
    // אפשרות 1: שדה platforms.telegram
    // אפשרות 2: המסמך עצמו הוא ID של טלגרם (במערכות ישנות)
    const telegramId = data.platforms?.telegram || (/^\d+$/.test(doc.id) ? doc.id : null);
    
    if (telegramId) {
        celebrants.push({
            id: telegramId,
            name: data.identity.displayName || data.username || 'חבר יקר'
        });
    }
  });

  return celebrants;
}

async function sendBirthdayMessages() {
  if (!bot) return;

  try {
      if (await alreadySentToday()) {
        console.log("✅ [Telegram] ברכות יום הולדת כבר נשלחו היום.");
        return;
      }

      const users = await getTodaysBirthdays();
      if (!users.length) {
        console.log("📭 [Telegram] אין ימי הולדת היום בקרב משתמשי הטלגרם.");
        await markAsSent();
        return;
      }

      console.log(`🎉 [Telegram] שולח ברכות ל־${users.length} משתמשים...`);

      // שליחה לקבוצה הראשית (מוגדר ב-ENV)
      const MAIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

      if (MAIN_CHAT_ID) {
          const names = users.map(u => `<b>${u.name}</b>`).join(', ');
          await bot.api.sendMessage(MAIN_CHAT_ID, 
            `🎂 <b>חגיגה בקהילה!</b>\n\n` +
            `יום הולדת שמח ל: ${names}! 🥳\n` +
            `שמעון מאחל לכם המון XP, ניצחונות ופינג נמוך!`, 
            { parse_mode: "HTML" }
          );
      }

      await markAsSent();

  } catch (error) {
      console.error("❌ [Telegram Birthday Error]:", error);
  }
}

module.exports = { sendBirthdayMessages };
// 📁 telegram/birthdayNotifierTelegram.js
const db = require("../utils/firebase");
const { Bot } = require("grammy");
require("dotenv").config();

// אם אין טוקן, אין מה להפעיל את הבוט הזה
const bot = process.env.TELEGRAM_TOKEN ? new Bot(process.env.TELEGRAM_TOKEN) : null;

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function alreadySentToday() {
  const doc = await db.collection("systemTasks").doc("lastBirthdayCheck").get();
  return doc.exists && doc.data().date === getTodayKey();
}

async function markAsSent() {
  await db.collection("systemTasks").doc("lastBirthdayCheck").set({ date: getTodayKey() }, { merge: true });
}

// 🔍 הפונקציה החדשה שסורקת את המשתמשים המאוחדים
async function getTodaysBirthdays() {
  // חיפוש יעיל: מביא רק משתמשים שיש להם יום הולדת מוגדר
  // (הערה: ב-Firestore אי אפשר לסנן לפי שדות פנימיים דינמיים בקלות בלי אינדקס, 
  // אז נביא את מי שיש לו יומולדת ונסנן בקוד - זה מהיר מאוד ל-100 משתמשים)
  const snapshot = await db.collection("users")
    .orderBy("identity.birthday") // מוודא שיש שדה כזה
    .get();

  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;

  const todays = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const bday = data.identity?.birthday;

    // בדיקה אם התאריך תואם להיום
    if (bday && bday.day === day && bday.month === month) {
      // נותן עדיפות לשם התצוגה, אחר כך לשם מלא, ולבסוף "חבר"
      const name = data.identity.displayName || data.identity.fullName || "חבר";
      
      // חשוב: אנחנו צריכים את ה-Telegram ID כדי לשלוח הודעה!
      // אם המשתמש נרשם דרך טלגרם, ה-ID יהיה ב-identity.telegramId
      // או שה-ID של המסמך עצמו הוא ה-ID (במקרה של משתמשי טלגרם בלבד שלא עברו איחוד)
      let telegramId = data.identity.telegramId;
      
      // fallback: אם ה-ID של המסמך הוא מספר בלבד, כנראה שזה ה-ID של טלגרם
      if (!telegramId && /^\d+$/.test(doc.id)) {
          telegramId = doc.id;
      }

      if (telegramId) {
          todays.push({ telegramId, name });
      }
    }
  });

  return todays;
}

async function sendBirthdayMessages() {
  if (!bot) return;

  try {
      if (await alreadySentToday()) {
        console.log("✅ [Telegram Birthday] ברכות כבר נשלחו היום. מדלג.");
        return;
      }

      const users = await getTodaysBirthdays();
      if (!users.length) {
        console.log("📭 [Telegram Birthday] אין ימי הולדת היום.");
        await markAsSent();
        return;
      }

      console.log(`🎉 [Telegram Birthday] שולח ברכות ל־${users.length} משתמשים...`);

      for (const user of users) {
        const msg = `
    🎂 <b>יום הולדת שמח, ${user.name}!</b>
    
    שמעון מאחל לך המון XP בחיים, פינג נמוך, ושלא ייגמר לך המקום ב-Inventory.
    שתזכה לשנה של ניצחונות! 🏆
    `;
        try {
            await bot.api.sendMessage(user.telegramId, msg, { parse_mode: "HTML" });
        } catch (err) {
            console.error(`❌ נכשל בשליחה ל-${user.name} (${user.telegramId}):`, err.message);
        }
      }

      await markAsSent();
      
  } catch (error) {
      console.error("❌ שגיאה כללית בבדיקת ימי הולדת טלגרם:", error);
  }
}

// ייצוא הפונקציה כדי שנוכל לקרוא לה מ-index.js
module.exports = { sendBirthdayMessages };
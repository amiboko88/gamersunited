// 📁 birthdayNotifierTelegram.js – מודול עצמאי עם נעילת Firestore ל־Yom Huledet

const db = require("../utils/firebase");
const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function alreadySentToday() {
  const doc = await db.collection("meta").doc("lastBirthdayCheck").get();
  return doc.exists && doc.data().date === getTodayKey();
}

async function markAsSent() {
  await db.collection("meta").doc("lastBirthdayCheck").set({ date: getTodayKey() });
}

async function getTodaysBirthdays() {
  const snapshot = await db.collection("birthdays").get();
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;

  const todays = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const bday = data.birthday;
    if (bday && bday.day === day && bday.month === month) {
      todays.push({ userId: doc.id, name: data.fullName || "חבר" });
    }
  });

  return todays;
}

async function sendBirthdayMessages() {
  if (await alreadySentToday()) {
    console.log("✅ ברכות כבר נשלחו היום. מדלג.");
    return;
  }

  const users = await getTodaysBirthdays();
  if (!users.length) {
    console.log("📭 אין ימי הולדת היום.");
    await markAsSent();
    return;
  }

  console.log(`🎉 שולח ברכות ל־${users.length} משתמשים...`);

  for (const user of users) {
    const msg = `
🎂 יום הולדת שמח, ${user.name}!
מקווה שתקבל לפחות נצחון אחד היום – או לפחות שלא תמות ראשון.
תזכור: בגיל הזה כבר לא אומרים GG... אומרים GPS.

– שמעון 😈
    `.trim();

    try {
      await bot.api.sendMessage(user.userId, msg);
      console.log(`✅ נשלחה ברכה ל־${user.name} (${user.userId})`);
    } catch (err) {
      console.warn(`⚠️ לא ניתן לשלוח ל־${user.name} (${user.userId}): ${err.description || err.message}`);
    }
  }

  await markAsSent();
}

module.exports = { sendBirthdayMessages };

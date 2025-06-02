const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

async function sendLeaderboardToTelegram(imagePath, caption = "") {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("❌ חסר TELEGRAM_TOKEN או TELEGRAM_CHAT_ID");
    return;
  }

  // הודעת התמונה הראשית
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const formData = new FormData();
  formData.append("chat_id", chatId);

  // טקסט ההודעה כולל הזמנה לריאקציה ❤️
  const inviteText = caption || "🏆 מצטייני השבוע – GAMERS UNITED IL\n\nלחצו ❤️ לפרגן למובילים!";
  formData.append("caption", inviteText);

  // התמונה
  formData.append("photo", fs.createReadStream(imagePath));

  // שליחת התמונה
  let messageId;
  try {
    const res = await axios.post(url, formData, { headers: formData.getHeaders() });
    messageId = res.data.result.message_id;
    console.log("✅ לוח הפעילות נשלח לטלגרם. message_id:", messageId);
  } catch (err) {
    console.error("❌ שגיאה בשליחת התמונה לטלגרם:", err.response?.data || err.message);
    return;
  }

  // נעיצת ההודעה
  try {
    await axios.post(`https://api.telegram.org/bot${token}/pinChatMessage`, {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true // שלא יצפצף לכולם
    });
    console.log("📌 ההודעה ננעצה בהצלחה ל־24 שעות!");
  } catch (err) {
    console.error("❌ שגיאה בנעיצת ההודעה:", err.response?.data || err.message);
  }

  // תזמון הסרת הנעיצה (אחרי 24 שעות = 86400000 מילי־שניות)
  setTimeout(async () => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/unpinChatMessage`, {
        chat_id: chatId,
        message_id: messageId
      });
      // שליחת הודעה שמסבירה
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: "📌 ההודעה הנעוצה התחלפה – מוזמנים לפרגן ❤️ גם השבוע למצטיינים הבאים!",
        reply_to_message_id: messageId
      });
      console.log("📌 ההודעה שוחררה מהנעיצה ונשלח פידבק.");
    } catch (err) {
      console.error("❌ שגיאה בהסרת נעיצה או בשליחת פידבק:", err.response?.data || err.message);
    }
  }, 24 * 60 * 60 * 1000); // 24 שעות

}

module.exports = { sendLeaderboardToTelegram };

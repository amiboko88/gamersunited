// 📁 telegramBridge.js – שליחת הודעות יזומות לטלגרם מבלי לפגוע ברעיון הקיים

const fetch = require("node-fetch");

// פונקציית שליחת הודעה רגילה
async function sendTelegramMessage(message, options = {}) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("❌ TELEGRAM_TOKEN או TELEGRAM_CHAT_ID לא מוגדרים.");
    return;
  }

  const payload = {
    chat_id: chatId,
    text: `📢 ${message}`,
    parse_mode: options.parse_mode || "Markdown", // ניתן לשנות ל־"HTML"
    disable_web_page_preview: options.disablePreview !== false,
    reply_markup: options.reply_markup || undefined
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("❌ שגיאת API בטלגרם:", data.description || data);
    } else {
      console.log("✅ הודעה נשלחה לטלגרם:", data.result.message_id);
    }
  } catch (error) {
    console.error("❌ שגיאה בשליחת ההודעה:", error.message);
  }
}

// 🆕 שליחת הודעת Embed-like (מחקה עיצוב מובנה)
async function sendStyledTelegramAlert(title, body, emoji = "📢") {
  const message = `*${emoji} ${title}*\n\n${body}`;
  await sendTelegramMessage(message, { parse_mode: "Markdown" });
}

// 🆕 שליחת לחצן אינליין
async function sendTelegramWithButton(message, buttonText, buttonUrl) {
  const reply_markup = {
    inline_keyboard: [
      [{ text: buttonText, url: buttonUrl }]
    ]
  };

  await sendTelegramMessage(message, {
    parse_mode: "Markdown",
    reply_markup
  });
}

module.exports = {
  sendTelegramMessage,
  sendStyledTelegramAlert,    // 🆕 שימוש לדוחות/התראות
  sendTelegramWithButton      // 🆕 שליחה עם כפתור
};

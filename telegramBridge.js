const fetch = require("node-fetch");

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
    parse_mode: options.parse_mode || "Markdown", // או "HTML"
    disable_web_page_preview: options.disablePreview || true,
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

module.exports = { sendTelegramMessage };

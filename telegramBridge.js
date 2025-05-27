async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("❌ TELEGRAM_TOKEN או TELEGRAM_CHAT_ID לא מוגדרים");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📢 ${message}`,
        parse_mode: "Markdown"
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("❌ שגיאה בשליחה לטלגרם:", data);
    }
  } catch (err) {
    console.error("❌ תקלה בשליחה לטלגרם:", err);
  }
}

module.exports = { sendTelegramMessage };

// 📁 utils/fifoMemory.js
// זיכרון זמני לפיפו – הודעות פעילות למחיקה אוטומטית

const lastFifoMessages = new Map();

/**
 * מחיקת ההודעות של הפיפו הקודם
 * @param {string} guildId
 */
async function deletePreviousFifoMessages(guildId) {
  const messages = lastFifoMessages.get(guildId);
  if (!messages) return;

  for (const msg of messages) {
    try {
      await msg.delete();
    } catch {}
  }

  lastFifoMessages.delete(guildId);
}

/**
 * שמירת ההודעות של הפיפו הנוכחי
 * @param {string} guildId
 * @param {Message[]} messages
 */
function setFifoMessages(guildId, messages) {
  lastFifoMessages.set(guildId, messages);
}

module.exports = {
  deletePreviousFifoMessages,
  setFifoMessages
};

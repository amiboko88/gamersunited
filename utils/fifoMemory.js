// 📁 utils/fifoMemory.js
// זיכרון זמני לפיפו – הודעות פעילות למחיקה אוטומטית

const lastFifoMessages = new Map(); // לשימוש קיים
const fifoMessageMeta = new Map(); // חדש – לכל הודעה תיעוד זמן

const SIX_HOURS = 6 * 60 * 60 * 1000;

function setFifoMessages(guildId, messages) {
  lastFifoMessages.set(guildId, messages);

  const now = Date.now();
  const meta = fifoMessageMeta.get(guildId) || [];

  const newMeta = messages.map(msg => ({
    messageId: msg.id,
    channelId: msg.channel.id,
    createdAt: now,
    cleaned: false
  }));

  fifoMessageMeta.set(guildId, [...meta, ...newMeta]);
}

async function deletePreviousFifoMessages(guildId) {
  const messages = lastFifoMessages.get(guildId);
  if (!messages) return;

  for (const msg of messages) {
    try {
      await msg.delete();
    } catch {}
  }

  lastFifoMessages.delete(guildId);
  fifoMessageMeta.delete(guildId); // גם metadata
}

// 🧼 מנגנון ניקוי כפתורים ישנים כל 10 דקות
setInterval(async () => {
  const now = Date.now();

  for (const [guildId, metaList] of fifoMessageMeta.entries()) {
    for (const meta of metaList) {
      if (meta.cleaned) continue;
      if (now - meta.createdAt < SIX_HOURS) continue;

      try {
        const guild = await global.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const channel = await guild.channels.fetch(meta.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;

        const message = await channel.messages.fetch(meta.messageId).catch(() => null);
        if (!message) continue;

        await message.edit({ components: [] });
        meta.cleaned = true;
        console.log(`🧼 כפתורים הוסרו מהודעה ${meta.messageId} (שרת ${guildId})`);
      } catch (err) {
        console.warn('⚠️ שגיאה בניקוי כפתור ישן:', err.message);
      }
    }
  }
}, 10 * 60 * 1000); // כל 10 דקות

module.exports = {
  deletePreviousFifoMessages,
  setFifoMessages
};

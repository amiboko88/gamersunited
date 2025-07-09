// 📁 utils/fifoMemory.js
// זיכרון זמני לפיפו – הודעות פעילות למחיקה אוטומטית

const lastFifoMessages = new Map();
const fifoMessageMeta = new Map();

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

/**
 * מנקה כפתורים מהודעות פיפו ישנות (מעל 6 שעות).
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 */
async function cleanupOldFifoMessages() {
  const now = Date.now();
  if (!global.client) return; // הגנה במקרה שהבוט עדיין לא מוכן

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
        if (!message) {
          meta.cleaned = true; // סמן כנקי אם ההודעה לא קיימת
          continue;
        }

        await message.edit({ components: [] });
        meta.cleaned = true;
        console.log(`🧼 כפתורים הוסרו מהודעה ${meta.messageId} (שרת ${guildId})`);
      } catch (err) {
        if (err.code === 10008) { // Unknown Message
          meta.cleaned = true;
        } else {
          console.warn('⚠️ שגיאה בניקוי כפתור ישן:', err.message);
        }
      }
    }
    
    // נקה מהמטא-דאטה את כל מה שכבר טופל
    const stillActiveMeta = metaList.filter(meta => !meta.cleaned);
    if (stillActiveMeta.length === 0) {
        fifoMessageMeta.delete(guildId);
    } else {
        fifoMessageMeta.set(guildId, stillActiveMeta);
    }
  }
}

module.exports = {
  deletePreviousFifoMessages,
  setFifoMessages,
  cleanupOldFifoMessages
};
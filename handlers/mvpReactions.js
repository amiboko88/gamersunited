const { log } = require('../utils/logger');

const REACTION_THRESHOLD = 5;
const REACTION_EMOJI = '🏅';
const RESPONSE_TIME_MS = 1000 * 60 * 60 * 24; // 24 שעות

let isTracking = false;
let currentMessageId = null;

async function startMvpReactionWatcher(client, db) {
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();

  if (!statusSnap.exists) return;

  const { messageId, channelId, lastAnnouncedDate } = statusSnap.data();
  if (!messageId || !channelId || !lastAnnouncedDate) return;

  const today = new Date().toISOString().split('T')[0];
  if (today !== lastAnnouncedDate) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  if (isTracking) return;
  isTracking = true;
  currentMessageId = message.id;

  log(`👁️ התחיל מעקב אחרי ריאקטים להודעת MVP (${messageId})`);

  const timer = setTimeout(async () => {
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.reactions.resolve(REACTION_EMOJI)?.remove().catch(() => {});
      log(`🧹 הסתיים מעקב – הריאקט הוסר`);
    } catch (err) {
      log(`⚠️ שגיאה בסיום מעקב ריאקטים: ${err.message}`);
    }

    isTracking = false;
    currentMessageId = null;
  }, RESPONSE_TIME_MS);

  client.on('messageReactionAdd', async (reaction, user) => {
    if (
      reaction.message.id !== currentMessageId ||
      reaction.emoji.name !== REACTION_EMOJI ||
      user.bot
    ) return;

    const count = reaction.count;
    if (count >= REACTION_THRESHOLD) {
      const exists = await channel.messages.fetch({ limit: 10 })
        .then(msgs => msgs.some(m => m.content.includes('הקהל אמר')))
        .catch(() => false);

      if (!exists) {
        await channel.send(`🔥 הקהל אמר את דברו – המצטיין ראוי לשתייה על חשבון המפסיד! 🍻`);
        log(`🎉 הקהל תמך במצטיין – נשלחה תגובה`);
      }
    }
  });
}

module.exports = { startMvpReactionWatcher };

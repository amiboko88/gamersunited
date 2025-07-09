// 📁 handlers/mvpReactions.js
const { log } = require('../utils/logger');
const { smartRespond } = require('./smartChat');
const db = require('../utils/firebase'); // הוספת ייבוא חסר של מסד הנתונים

const REACTION_THRESHOLD = 5;
const REACTION_EMOJI = '🏅';

let currentMessageId = null;

/**
 * בודק את כמות הריאקשנים על הודעת ה-MVP ושולח תגובה אם הושג הסף.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function checkMvpReactions(client) {
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();
  if (!statusSnap.exists) return;

  const { messageId, channelId, reacted } = statusSnap.data();
  if (!messageId || !channelId) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  if (messageId !== currentMessageId) {
    currentMessageId = message.id;
    await statusRef.set({ reacted: false }, { merge: true });
    log(`🔄 התחיל מעקב חדש על הודעת MVP (${messageId})`);
  }

  const reaction = message.reactions.resolve(REACTION_EMOJI);
  const count = reaction?.count || 0;

  if (count >= REACTION_THRESHOLD && !reacted) {
    await channel.send(`🔥 הקהל אמר את דברו – המצטיין ראוי לשתייה על חשבון המפסיד! 🍻`);
    await statusRef.set({ reacted: true }, { merge: true });
    log(`🎉 תגובת קהל נשלחה (🏅 ${count})`);
  }
}

/**
 * מפעיל האזנה קבועה לאירוע של הוספת ריאקשן להודעת ה-MVP.
 * יש לקרוא לפונקציה זו פעם אחת בלבד כשהבוט עולה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
function initializeMvpReactionListener(client) {
  client.on('messageReactionAdd', async (reaction, user) => {
    if (
      !currentMessageId || // ודא שיש הודעה במעקב
      reaction.message.id !== currentMessageId ||
      reaction.emoji.name !== REACTION_EMOJI ||
      user.bot
    ) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const channel = reaction.message.channel;

    // יצירת אובייקט "הודעה מזויפת" כדי להפעיל את smartRespond
    const fakeMessage = {
      author: user,
      content: `לחצתי 🏅 על ה־MVP השבועי. אולי גם אני אהיה פעם...`,
      guild,
      member,
      channel,
      reply: async ({ content }) => {
        await channel.send({
          content: `🧠 תגובה אישית ל־${user.username}: ${content}`
        });
      },
      _simulateOnly: false
    };

    await smartRespond(fakeMessage, 'שובב');
  });

  log('👂 מאזין לריאקשנים על הודעות MVP.');
}

module.exports = { checkMvpReactions, initializeMvpReactionListener };
const { log } = require('../utils/logger');
const { smartRespond } = require('./smartChat');

const REACTION_THRESHOLD = 5;
const REACTION_EMOJI = '🏅';

let currentMessageId = null;

async function startMvpReactionWatcher(client, db) {
  const statusRef = db.doc('mvpSystem/status');

  setInterval(async () => {
    const statusSnap = await statusRef.get();
    if (!statusSnap.exists) return;

    const { messageId, channelId, reacted } = statusSnap.data();
    if (!messageId || !channelId) return;

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

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
  }, 10000); // כל 10 שניות

  // 🔁 תגובה אישית לכל לוחץ
  client.on('messageReactionAdd', async (reaction, user) => {
    if (
      reaction.message.id !== currentMessageId ||
      reaction.emoji.name !== REACTION_EMOJI ||
      user.bot
    ) return;

    const guild = client.guilds.cache.first();
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const channel = reaction.message.channel;

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

    await smartRespond(fakeMessage, 'שובב'); // אתה יכול לשנות מצב רוח אם תרצה
  });
}

module.exports = { startMvpReactionWatcher };

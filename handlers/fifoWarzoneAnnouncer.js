// 📁 handlers/fifoWarzoneAnnouncer.js

const { EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../utils/firebase');
const schedule = require('node-schedule');
const { generateProBanner } = require('./mediaGenerator');

const TARGET_CHANNEL_ID = '1372283521447497759';
const KEYWORDS = ['warzone', 'call of duty', 'black ops', 'mw3', 'mw2'];

function isPlayingWarzone(presence) {
  return presence?.activities?.some(activity =>
    activity.type === 0 &&
    KEYWORDS.some(k => (activity.name || '').toLowerCase().includes(k))
  );
}

function getGameName(presence) {
  return presence?.activities?.find(a => a.type === 0)?.name || 'משחק לא מזוהה';
}

async function deletePreviousMessage(channel) {
  try {
    const doc = await db.collection('fifoWarzoneAnnouncer').doc('latestMessage').get();
    const prevId = doc.exists ? doc.data().messageId : null;
    if (prevId) {
      const msg = await channel.messages.fetch(prevId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
  } catch (err) {
    console.warn('⚠️ שגיאה במחיקת הודעת WARZONE קודמת:', err.message);
  }
}

async function saveLastMessageId(messageId) {
  await db.collection('fifoWarzoneAnnouncer').doc('latestMessage').set({ messageId });
}

async function sendWarzoneEmbed(client) {
  const now = new Date();
  const day = now.getDay(); // 5 = שישי

  if (day === 5) return; // ❌ לא פועל בשישי

  const guild = client.guilds.cache.first();
  if (!guild) return;

  await guild.members.fetch({ withPresences: true });
  const warzonePlayers = guild.members.cache.filter(
    m => !m.user.bot && m.presence && isPlayingWarzone(m.presence)
  );

  if (warzonePlayers.size === 0) return;

  const mentions = warzonePlayers.map(m => `<@${m.id}>`).join('\n');
  const gameNames = [...new Set(warzonePlayers.map(m => getGameName(m.presence)))].join(', ');

  const embed = new EmbedBuilder()
    .setColor('#2F3136')
    .setTitle('🎮 שחקני WARZONE מחוברים עכשיו!')
    .setDescription(`**${warzonePlayers.size} שחקנים מחוברים:**\n${mentions}`)
    .setImage('attachment://probanner.webp')
    .setFooter({ text: `משחקים שזוהו: ${gameNames}` })
    .setTimestamp();

  // 🧠 יצירת הבאנר הדינמי החדש
  const imageBuffer = await generateProBanner(warzonePlayers);

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await deletePreviousMessage(channel);

  const message = await channel.send({
    embeds: [embed],
    files: [{ attachment: imageBuffer, name: 'probanner.webp' }]
  });

  await saveLastMessageId(message.id);
}

function startFifoWarzoneAnnouncer(client) {
  const hours = [20, 21, 22, 23];
  for (const hour of hours) {
    schedule.scheduleJob({ hour, minute: 0, tz: 'Asia/Jerusalem' }, () => {
      sendWarzoneEmbed(client);
    });
  }
}

module.exports = {
  startFifoWarzoneAnnouncer
};

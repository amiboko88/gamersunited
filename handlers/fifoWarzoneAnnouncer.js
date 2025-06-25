const { EmbedBuilder, ChannelType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/firebase');
const schedule = require('node-schedule');
const { generateProBanner } = require('./mediaGenerator');

const TARGET_CHANNEL_ID = '1372283521447497759'; // עדכן ל-ID של ערוץ הטקסט
const VOICE_CHANNEL_ID = '1231453923387379783'; // עדכן ל-ID של הערוץ הקולי
const GUILD_ID = '583574396686434304';         // עדכן ל-ID של השרת שלך

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
    console.warn('⚠️ שגיאה במחיקת הודעה קודמת:', err.message);
  }
}

async function saveLastMessageId(messageId) {
  await db.collection('fifoWarzoneAnnouncer').doc('latestMessage').set({ messageId });
}

async function sendWarzoneEmbed(client) {
  const now = new Date();
  if (now.getDay() === 5) return;

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  await guild.members.fetch({ withPresences: true });

  const connected = [];
  const missing = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const presence = member.presence;
    const voice = member.voice?.channel;

    if (!presence || !isPlayingWarzone(presence)) continue;

    if (voice) connected.push(member);
    else missing.push(member);
  }

  if (connected.length === 0) {
    console.log('ℹ️ אין שחקנים פעילים כרגע');
    return;
  }

  let file = null;
  try {
    const buffer = await generateProBanner(connected);
    file = new AttachmentBuilder(buffer, { name: 'rotation.webp' });
  } catch (err) {
    console.warn(`⚠️ בעיה ביצירת באנר: ${err.message}`);
  }

  const embed = new EmbedBuilder()
    .setColor('#2F3136')
    .setTitle('🎮 FIFO SQUAD כבר מחוברים!')
    .setDescription(`🎲 המשחק הפעיל: **${getGameName(connected[0]?.presence)}**`)
    .setFooter({ text: `שחקנים בערוץ: ${connected.length}` })
    .setTimestamp();

  if (file) embed.setImage('attachment://rotation.webp');

  const joinButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🎧 לחץ עליי להצטרף')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${VOICE_CHANNEL_ID}`)
  );

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await deletePreviousMessage(channel);

  const message = await channel.send({
    content: missing.length > 0 ? `🧟 ${missing.map(m => `<@${m.id}>`).join(' ')}` : null,
    embeds: [embed],
    files: file ? [file] : [],
    components: [joinButton]
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

// 📁 handlers/fifoWarzoneAnnouncer.js
const { EmbedBuilder, ChannelType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/firebase');
const { generateProBanner } = require('./mediaGenerator');

const TARGET_CHANNEL_ID = '1372283521447497759';
const VOICE_CHANNEL_ID = '1231453923387379783';
const GUILD_ID = '583574396686434304';

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

/**
 * בודק ושולח הכרזה על משחק Warzone אם התנאים מתקיימים.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function sendWarzoneEmbed(client) {
  try {
    const now = new Date();
    if (now.getDay() === 5) return; // יום שישי — דילוג

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

    if (connected.length < 5) {
      console.log(`⏸ פחות מ־5 שחקנים מחוברים – לא נשלחת הודעה (${connected.length})`);
      return;
    }

    let file = null;
    try {
      const buffer = await generateProBanner(connected);
      file = new AttachmentBuilder(buffer, { name: 'rotation.png' });
    } catch (err) {
      console.warn(`⚠️ בעיה ביצירת באנר: ${err.message}`);
    }

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setDescription(`🎲 : **${getGameName(connected[0]?.presence)}**`)
      .setFooter({ text: ` ${connected.length} שחקנים בערוץ:` })
      .setTimestamp();

    if (file) embed.setImage('attachment://rotation.png');

    const joinButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🎧 לחץ עליי להצטרף')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${GUILD_ID}/${VOICE_CHANNEL_ID}`)
    );

    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await deletePreviousMessage(channel);

    const sarcasticMessage = now.getHours() === 1
      ? '😴 עדיין משחקים בשעה כזו? לכו לישון יא חיות'
      : null;

    const tags = missing.map(m => `<@${m.id}>`).join(' ');

    const message = await channel.send({
        content: [sarcasticMessage, tags.length > 0 ? `🧟 ${tags}` : null]
          .filter(Boolean)
          .join('\n'),
        embeds: [embed],
        files: file ? [file] : [],
        components: [joinButton]
      });
      
    await saveLastMessageId(message.id);

  } catch (err) {
    console.error('❌ שגיאה כללית בפונקציית Warzone Embed:', err.message);
  }
}

module.exports = {
  sendWarzoneEmbed
};
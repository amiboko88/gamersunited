// 📁 handlers/fifoWarzoneAnnouncer.js
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/firebase'); // חיבור ל-DB

const TARGET_CHANNEL_ID = '1372283521447497759';
const VOICE_CHANNEL_ID = '1231453923387379783';
const GUILD_ID = '583574396686434304';
// הפניה למסמך המערכת
const SYSTEM_DOC_REF = db.collection('system_metadata').doc('fifo_warzone');

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
    const doc = await SYSTEM_DOC_REF.get();
    const prevId = doc.exists ? doc.data().lastAnnouncementId : null;
    if (prevId) {
      const msg = await channel.messages.fetch(prevId).catch(() => null);
      if (msg && msg.deletable) await msg.delete();
    }
  } catch (err) { console.warn('Could not delete previous Warzone message:', err.message); }
}

async function sendWarzoneEmbed(client) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!voiceChannel || voiceChannel.members.size === 0) return;

    const members = voiceChannel.members;
    const connected = members.filter(m => isPlayingWarzone(m.presence));
    const missing = members.filter(m => !isPlayingWarzone(m.presence));

    if (connected.size === 0) return;

    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    await deletePreviousMessage(channel);

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle('🎮 Warzone Squad Active!')
      .setDescription(`משחקים כרגע: **${getGameName(connected.first()?.presence)}**`)
      .addFields({ name: 'שחקנים', value: connected.map(m => m.displayName).join('\n') || 'אין', inline: true })
      .setFooter({ text: `${connected.size} לוחמים בשטח` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('הצטרף ללובי')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${GUILD_ID}/${VOICE_CHANNEL_ID}`)
    );

    const message = await channel.send({ 
        content: missing.size > 0 ? `👀 ${missing.map(m => `<@${m.id}>`).join(' ')} אתם במשחק לא נכון!` : null,
        embeds: [embed], 
        components: [row] 
    });

    // שמירה במיקום המסודר
    await SYSTEM_DOC_REF.set({ 
        lastAnnouncementId: message.id,
        updatedAt: new Date().toISOString()
    }, { merge: true });
}

module.exports = { sendWarzoneEmbed };
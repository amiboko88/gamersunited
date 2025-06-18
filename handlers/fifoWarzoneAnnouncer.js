const { EmbedBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
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

// ✨ משפטים רנדומליים חכמים
const dynamicMessages = [
  "🎯 הצוות כבר בפנים — ואתם עדיין מתלבטים? הגיע הזמן להצטרף.",
  "🎮 WARZONE בשיאו. החברים בערוץ, ואתם? רק לחיצה ואתם שם.",
  "🔊 כולם מדברים כבר בפנים. תראו נוכחות.",
  "🧠 FIFO לא מחכה — מתחברים או מתייבשים בצד?",
  "🔥 הערוץ פתוח. הקרב התחיל. תהיו חלק מזה.",
  "🚀 עכשיו זה הרגע. כל מי שמחובר — כבר שומעים אותו.",
  "💥 אתם במשחק, אבל לא בשיחה. מה הקטע?",
  "🏆 מי שבערוץ — כבר עושה עבודה. תתייצבו.",
  "📡 WARZONE בלי Voice זה כמו תימני בלי מנגל. תתחברו.",
  "💣 FIFO פעיל. תשלים את הצוות, תפסיק להיעלם."
];

function getRandomMessage() {
  return dynamicMessages[Math.floor(Math.random() * dynamicMessages.length)];
}

async function sendWarzoneEmbed(client) {
  const now = new Date();
  const day = now.getDay(); // 5 = שישי

  if (day === 5) return;

  const guild = client.guilds.cache.first();
  if (!guild) return;

  await guild.members.fetch({ withPresences: true });

  const connected = [];
  const missing = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const presence = member.presence;
    const voice = member.voice?.channel;

    if (!presence || !isPlayingWarzone(presence)) continue;

    if (voice) {
      connected.push(member);
    } else {
      missing.push(member);
    }
  }

  if (connected.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor('#2F3136')
    .setTitle('🎮 FIFO SQUAD כבר מחוברים!')
    .setDescription(getRandomMessage())
    .setImage('attachment://probanner.webp')
    .setFooter({ text: `שחקנים בערוץ: ${connected.length}` })
    .setTimestamp();

  // 🎨 יצירת התמונה
  const imageBuffer = await generateProBanner(connected);

  // 🧪 בדיקת תקינות
  if (!imageBuffer || !(imageBuffer instanceof Buffer) || !imageBuffer.length) {
    console.error('❌ imageBuffer לא תקין — שליחה מבוטלת');
    return;
  }

  const file = new AttachmentBuilder(imageBuffer, { name: 'probanner.webp' });

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await deletePreviousMessage(channel);

  const message = await channel.send({
    content: missing.length > 0
      ? `🧟 ${missing.map(m => `<@${m.id}>`).join(' ')}`
      : null,
    embeds: [embed],
    files: [file]
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

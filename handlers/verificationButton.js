// 📁 handlers/verificationButton.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const db = require('../utils/firebase');
const { logToWebhook } = require('../utils/logger');
const path = require('path');

const VERIFIED_ROLE_ID = '1120787309432938607';
const VERIFICATION_CHANNEL_ID = '1120791404583587971';
const TRACKING_COLLECTION = 'dmTracking';
const MESSAGE_COLLECTION = 'verificationMessages';
const DELAY_HOURS = 1;

const embedImageUrl = 'attachment://verify.png'; // 🔁 שימוש בתמונה מהשרת עצמו

async function setupVerificationMessage(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  const messageRef = db.collection(MESSAGE_COLLECTION).doc(guild.id);
  const existing = await messageRef.get();
  if (existing.exists) return; // ⛔ כבר נשלח Embed

  const embed = new EmbedBuilder()
    .setImage(embedImageUrl)
    .setColor('DarkNavy')
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('verify')
    .setLabel('✅ לחץ כאן לאימות')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(button);

  const sent = await channel.send({
    embeds: [embed],
    components: [row],
    files: [path.join(__dirname, '../assets/verify.png')]
  });
  await messageRef.set({ messageId: sent.id });
}

function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify') return;

  const member = interaction.member;
  if (!member || member.roles.cache.size > 1) {
    return interaction.reply({ content: 'רק משתמשים חדשים יכולים לאמת את עצמם כאן.', ephemeral: true });
  }

  member.roles.add(VERIFIED_ROLE_ID).then(() => {
    interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', ephemeral: true });
    logToWebhook({
      title: '🟢 אימות באמצעות כפתור',
      description: `<@${member.id}> אומת דרך כפתור האימות.`
    });
  });
}

async function startDmTracking(client) {
  setInterval(async () => {
    const now = Date.now();
    const snapshot = await db.collection(TRACKING_COLLECTION)
      .where('type', '==', 'verification')
      .where('status', '==', 'pending')
      .get();

    snapshot.forEach(async doc => {
      const data = doc.data();
      const sentTime = new Date(data.sentAt).getTime();
      if (now - sentTime >= DELAY_HOURS * 60 * 60 * 1000) {
        try {
          const user = await client.users.fetch(doc.id);
          const dm = await user.send('👋 היי, שמנו לב שעדיין לא אומתת. לחץ כאן כדי לקבל גישה:\nhttps://discord.com/channels/' + data.guildId + '/' + VERIFICATION_CHANNEL_ID);

          const collector = dm.channel.createMessageCollector({ filter: m => !m.author.bot, time: 1000 * 60 * 60 });
          collector.on('collect', async response => {
            await db.collection(TRACKING_COLLECTION).doc(doc.id).update({ status: 'responded', response: response.content });
            logToWebhook({
              title: '📩 תגובת DM לאימות',
              description: `<@${doc.id}> הגיב: ${response.content}`,
              color: 0x3498db
            });
          });
        } catch (err) {
          console.warn('⚠️ שגיאה בשליחת DM:', err.message);
          await db.collection(TRACKING_COLLECTION).doc(doc.id).update({ status: 'ignored' });
        }
      }
    });
  }, 1000 * 60 * 10); // רץ כל 10 דק׳
}

module.exports = {
  setupVerificationMessage,
  handleInteraction,
  startDmTracking
};

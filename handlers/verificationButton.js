// 📁 handlers/verificationButton.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const db = require('../utils/firebase');
const { logToWebhook } = require('../utils/logger');
const path = require('path');

const VERIFIED_ROLE_ID = '1120787309432938607';
const VERIFICATION_CHANNEL_ID = '1120791404583587971';
const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'dmTracking';
const MESSAGE_COLLECTION = 'verificationMessages';
const DELAY_HOURS = 1;
const embedImageUrl = 'attachment://verify.png';

async function setupVerificationMessage(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  const messageRef = db.collection(MESSAGE_COLLECTION).doc(guild.id);
  const existing = await messageRef.get();
  if (existing.exists) return;

  const embed = new EmbedBuilder()
    .setTitle('GAMERS UNITED IL')
    .setImage(embedImageUrl)
    .setColor('#ffa500');

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

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify') return;

  const member = interaction.member;
  const user = interaction.user;
  const roles = member.roles.cache;

  const allowed = roles.size === 1 && roles.has(interaction.guild.roles.everyone.id);
  if (!allowed) {
    return interaction.reply({
      content: 'רק משתמשים חדשים יכולים לאמת את עצמם כאן.',
      ephemeral: true
    });
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);
    await interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', ephemeral: true });

    logToWebhook({
      title: '🟢 אימות באמצעות כפתור',
      description: `<@${member.id}> אומת דרך כפתור האימות.`
    });

    await db.collection(TRACKING_COLLECTION).doc(member.id).set({
      type: 'verification',
      status: 'pending',
      sentAt: new Date().toISOString(),
      guildId: interaction.guild.id
    });

    try {
      await user.send(
        '🎉 ברוך הבא ל־ Gamers United IL!\n' +
        'אם אתה רואה רק אפור או מרגיש אבוד – תכתוב לי פה ואעזור לך 💬'
      );
    } catch (err) {
      console.warn('⚠️ לא ניתן לשלוח DM למשתמש לאחר אימות:', err.message);
    }
  } catch (err) {
    console.error('❌ שגיאה באימות:', err);
    await interaction.reply({
      content: '❌ משהו השתבש, נסה שוב או פנה למנהל.',
      ephemeral: true
    });
  }
}

async function startDmTracking(client) {
  setInterval(async () => {
    const now = Date.now();
    const snapshot = await db.collection(TRACKING_COLLECTION)
      .where('type', '==', 'verification')
      .where('status', '==', 'pending')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const sentTime = new Date(data.sentAt).getTime();
      const userId = doc.id;

      const oneHour = 60 * 60 * 1000;
      const twentyFourHours = 24 * oneHour;

      if (data.reminderSent) {
        if (now - sentTime >= twentyFourHours) {
          await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'ignored' });
          logToWebhook({
            title: '⏱️ לא התקבלה תגובה ל־DM (אימות)',
            description: `<@${userId}> לא הגיב להודעת האימות במשך 24 שעות.`,
            color: 0xf1c40f
          });
        }
        continue;
      }

      if (now - sentTime >= oneHour) {
        try {
          const user = await client.users.fetch(userId);
          const dm = await user.send(
            '👋 היי, רק מזכירים שאם הסתבכת – אפשר פשוט לכתוב לי פה.\n' +
            'אם אתה עדיין רואה אפור, או משהו לא עובד – הנה הקישור חזרה לאימות:\n' +
            `https://discord.com/channels/${data.guildId}/${VERIFICATION_CHANNEL_ID}`
          );

          await db.collection(TRACKING_COLLECTION).doc(userId).update({ reminderSent: true });

          const collector = dm.channel.createMessageCollector({
            filter: m => !m.author.bot,
            time: oneHour
          });

          collector.on('collect', async response => {
            await db.collection(TRACKING_COLLECTION).doc(userId).update({
              status: 'responded',
              response: response.content
            });

            logToWebhook({
              title: '📩 תגובת DM לאחר אימות',
              description: `<@${userId}> הגיב: ${response.content}`,
              color: 0x3498db
            });
          });

        } catch (err) {
          console.warn(`⚠️ לא ניתן לשלוח תזכורת ל־${userId}:`, err.message);
          await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'ignored' });
        }
      }
    }
  }, 1000 * 60 * 10); // כל 10 דקות
}

module.exports = {
  setupVerificationMessage,
  handleInteraction,
  startDmTracking
};

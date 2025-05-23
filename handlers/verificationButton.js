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
const TRACKING_COLLECTION = 'dmTracking';
const MESSAGE_COLLECTION = 'verificationMessages';
const BIRTHDAY_COLLECTION = 'birthdays';
const FRIEND_ROLE_ID = '1375383831015723100';
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
    .setLabel('לחץ כאן כדי להתחיל את המסע שלך')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(button);

  const sent = await channel.send({
    embeds: [embed],
    components: [row],
    files: [path.join(__dirname, '../assets/verify.png')]
  });

  await messageRef.set({ messageId: sent.id });
}

function isValidDate(input) {
  const regex = /^(\d{1,2})[\/\.](\d{1,2})$/;
  const match = input.match(regex);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify') return;

  const member = interaction.member;
  if (!member || member.roles.cache.size > 1) {
    return interaction.reply({ content: 'רק משתמשים חדשים יכולים לאמת את עצמם כאן.', ephemeral: true });
  }

  await member.roles.add(VERIFIED_ROLE_ID);
  await interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', ephemeral: true });
  logToWebhook({
    title: '🟢 אימות באמצעות כפתור',
    description: `<@${member.id}> אומת דרך כפתור האימות.`
  });

  // בדוק אם יש לו יום הולדת
  const bdayDoc = await db.collection(BIRTHDAY_COLLECTION).doc(member.id).get();
  if (bdayDoc.exists) return;

  try {
    const dm = await member.send({
      content: `🎉 היי ${member.displayName}! עכשיו שאתה חבר קהילה – אתה יכול לקבל פינוק מיוחד ביום הולדת 🎂\n\nשלח לי את התאריך שלך בפורמט: \`31/12\` או \`31.12\`, ואני אדאג להכל!`
    });

    const collector = dm.channel.createMessageCollector({
      filter: m => !m.author.bot,
      time: 1000 * 60 * 5,
      max: 1
    });

    collector.on('collect', async msg => {
      const parsed = isValidDate(msg.content.trim());
      if (!parsed) {
        await dm.send('❌ לא הבנתי את התאריך... נסה שוב בצורה כמו `13/5` או `28.11` 🙏');
        return;
      }

      await db.collection(BIRTHDAY_COLLECTION).doc(member.id).set({
        birthday: parsed,
        fullName: member.displayName,
        addedBy: member.id,
        createdAt: new Date().toISOString()
      });

      await member.roles.add(FRIEND_ROLE_ID).catch(() => {});
      setTimeout(() => member.roles.remove(FRIEND_ROLE_ID).catch(() => {}), 1000 * 60 * 60 * 24);

      await dm.send('🎁 מעולה! שמעון שמר את התאריך 🎉 מחכה לחגוג איתך ביום הגדול!');
      logToWebhook({
        title: '🎈 נרשם יום הולדת חדש',
        description: `<@${member.id}> הוסיף תאריך: **${parsed}**`,
        color: 0x00c853
      });
    });

  } catch (err) {
    console.warn('⚠️ לא ניתן לשלוח DM:', err.message);
  }
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
          const dm = await user.send(
            '👋 היי, שמנו לב שעדיין לא אומתת. לחץ כאן כדי לקבל גישה:\n' +
            `https://discord.com/channels/${data.guildId}/${VERIFICATION_CHANNEL_ID}`
          );

          const collector = dm.channel.createMessageCollector({
            filter: m => !m.author.bot,
            time: 1000 * 60 * 60
          });

          collector.on('collect', async response => {
            await db.collection(TRACKING_COLLECTION).doc(doc.id).update({
              status: 'responded',
              response: response.content
            });
            logToWebhook({
              title: '📩 תגובת DM לאימות',
              description: `<@${doc.id}> הגיב: ${response.content}`,
              color: 0x3498db
            });
          });

          collector.on('end', async collected => {
            if (collected.size === 0) {
              await db.collection(TRACKING_COLLECTION).doc(doc.id).update({ status: 'ignored' });
              logToWebhook({
                title: '⏱️ לא התקבלה תגובה ל־DM (אימות)',
                description: `<@${doc.id}> לא הגיב להודעת האימות במשך 24 שעות.`,
                color: 0xf1c40f
              });
            }
          });

        } catch (err) {
          console.warn('⚠️ שגיאה בשליחת DM:', err.message);
          await db.collection(TRACKING_COLLECTION).doc(doc.id).update({ status: 'ignored' });
        }
      }
    });
  }, 1000 * 60 * 10);
}

module.exports = {
  setupVerificationMessage,
  handleInteraction,
  startDmTracking
};

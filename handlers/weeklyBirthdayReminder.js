// 📁 handlers/weeklyBirthdayReminder.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, MessageFlags } = require('discord.js');
const path = require('path');
const { log } = require('../utils/logger');
const db = require('../utils/firebase');

const TARGET_CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID || '583575179880431616';

function isSaturdayAt20() {
  const now = new Date();
  const israelHour = now.getUTCHours() + 3;
  return now.getDay() === 6 && israelHour === 20;
}

async function wasAlreadySentThisWeek() {
  const statusRef = db.doc('reminders/status');
  const snap = await statusRef.get();
  if (!snap.exists) return false;

  const raw = snap.data().lastBirthdayReminder;
  const lastSent = raw instanceof Date ? raw : raw?.toDate?.() || new Date(0);

  const now = new Date();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;

  return now - lastSent < oneWeek && lastSent.getDay() === 6;
}

async function markReminderAsSent() {
  await db.doc('reminders/status').set({
    lastBirthdayReminder: new Date()
  }, { merge: true });
}

async function sendWeeklyReminder(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
  if (!(channel instanceof TextChannel)) return;

  const embed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('🎂 אל תשכחו לעדכן יום הולדת!')
    .setDescription(
      `שמעון רוצה לדעת מתי לחגוג איתכם 🎉\n\n` +
      `אם עדיין לא הזנתם תאריך – תכתבו עכשיו: \`/הוסף_יום_הולדת\`\n` +
      `או לחצו על הכפתור פה למטה 👇`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Gamer of the Day • GAMERS UNITED IL' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_birthday_modal')
      .setLabel('📅 הוסף יום הולדת עכשיו')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: '@everyone 🎈 תזכורת שבועית!',
    embeds: [embed],
    components: [row],
    files: [path.join(__dirname, '../assets/logo.png')]
  });

  log('📅 נשלחה תזכורת שבועית לעדכון יום הולדת.');
  await markReminderAsSent();
}

function startWeeklyBirthdayReminder(client) {
  setInterval(async () => {
    if (isSaturdayAt20()) {
      const alreadySent = await wasAlreadySentThisWeek();
      if (alreadySent) {
        return; // ⚠️ לא מדפיס שוב את הלוג כל 5 דקות
      }
      await sendWeeklyReminder(client).catch(console.error);
    }
  }, 1000 * 60 * 5); // כל 5 דקות
}

module.exports = { startWeeklyBirthdayReminder };

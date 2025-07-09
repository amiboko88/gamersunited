// 📁 handlers/weeklyBirthdayReminder.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } = require('discord.js');
const path = require('path');
const { log } = require('../utils/logger');
const db = require('../utils/firebase');

const TARGET_CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID || '583575179880431616';

/**
 * שולח תזכורת שבועית לעדכון יום הולדת.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function sendWeeklyReminder(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
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
  
  // עדכון חותמת זמן למניעת שליחה כפולה אם הבוט יופעל מחדש באותו יום
  await db.doc('reminders/status').set({
    lastBirthdayReminder: new Date()
  }, { merge: true });
}

module.exports = { sendWeeklyReminder };
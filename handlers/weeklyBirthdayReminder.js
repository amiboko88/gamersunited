const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } = require('discord.js');
const path = require('path');

const TARGET_CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID || '583575179880431616';

function isSaturdayAt20() {
  const now = new Date();
  const israelHour = now.getUTCHours() + 3;
  return now.getDay() === 6 && israelHour === 20;
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
    .setFooter({ text: 'Gamer of the Day • United IL' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fake_add_birthday') // לא מבצע – רק מדגים
      .setLabel('📅 הוסף יום הולדת עכשיו')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: '@everyone 🎈 תזכורת שבועית!',
    embeds: [embed],
    components: [row],
    files: [path.join(__dirname, '../assets/logo.png')]
  });
}

function startWeeklyBirthdayReminder(client) {
  setInterval(() => {
    if (isSaturdayAt20()) {
      sendWeeklyReminder(client).catch(console.error);
    }
  }, 1000 * 60 * 5); // בדיקה כל 5 דקות
}

module.exports = { startWeeklyBirthdayReminder };

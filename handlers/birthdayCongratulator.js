const { EmbedBuilder, TextChannel } = require('discord.js');
const path = require('path');
const db = require('../utils/firebase');
const { log } = require('../utils/logger');

// ✅ ערוץ ייעודי
const TARGET_CHANNEL_ID = '583575179880431616'; // נקבע קבוע לפי בקשתך

function isJustAfterMidnight() {
  const now = new Date();
  return now.getHours() === 0 && now.getMinutes() <= 5;
}

function getTodaysBirthdays(snapshot) {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;

  return snapshot.docs
    .map(doc => {
      const data = doc.data();
      const { birthday, fullName } = data;
      if (!birthday) return null;

      const { day: bDay, month: bMonth, year } = birthday;
      if (bDay === day && bMonth === month) {
        const age = today.getFullYear() - year;
        return { fullName, age };
      }
      return null;
    })
    .filter(Boolean);
}

async function sendBirthdayMessage(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
  if (!(channel instanceof TextChannel)) return;

  const snapshot = await db.collection('birthdays').get();
  const todayBirthdays = getTodaysBirthdays(snapshot);

  if (todayBirthdays.length === 0) return;

  for (const person of todayBirthdays) {
    const embed = new EmbedBuilder()
      .setTitle(`🎉 מזל טוב ל־${person.fullName}!`)
      .setDescription(`🎂 חוגג/ת היום **${person.age}** שנים!\n\nאיחולים חמים מקהילת **Gamers United IL** 🎈`)
      .setColor('Fuchsia')
      .setImage('attachment://happybirthday.png')
      .setFooter({ text: 'שמעון שולח חיבוק 🎁' })
      .setTimestamp();

    await channel.send({
      content: '@everyone חגיגה בקהילה! 🎊',
      embeds: [embed],
      files: [path.join(__dirname, '../assets/happybirthday.png')]
    });

    log(`🎉 ברכת יום הולדת נשלחה ל־${person.fullName}`);
  }
}

function startBirthdayCongratulator(client) {
  setInterval(() => {
    if (isJustAfterMidnight()) {
      sendBirthdayMessage(client).catch(console.error);
    }
  }, 1000 * 60 * 5); // כל 5 דקות
}

module.exports = { startBirthdayCongratulator };

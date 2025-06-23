const { EmbedBuilder, TextChannel } = require('discord.js');
const path = require('path');
const db = require('../utils/firebase');
const { log } = require('../utils/logger');

const TARGET_CHANNEL_ID = '583575179880431616'; // הערוץ הקבוע

function isNineAM() {
  const now = new Date();
  return now.getHours() === 9 && now.getMinutes() <= 5;
}

function getTodaysBirthdays(snapshot) {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;

  const seenDiscordIds = new Set(); // כדי להימנע מכפילויות

  return snapshot.docs
    .map(doc => {
      const data = doc.data();
      const { birthday, fullName, linkedAccounts = [] } = data;

      if (!birthday) return null;

      const { day: bDay, month: bMonth, year } = birthday;
      if (bDay !== day || bMonth !== month) return null;

      const discordId = linkedAccounts.find(id => id.startsWith('discord:'));
      if (!discordId || seenDiscordIds.has(discordId)) return null;

      seenDiscordIds.add(discordId);

      const age = today.getFullYear() - year;
      return { fullName, age, discordId: discordId.split(':')[1] };
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
    const member = await guild.members.fetch(person.discordId).catch(() => null);
    if (!member) continue;

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
    if (isNineAM()) {
      sendBirthdayMessage(client).catch(console.error);
    }
  }, 1000 * 60 * 5); // בדיקה כל 5 דקות
}

module.exports = { startBirthdayCongratulator };

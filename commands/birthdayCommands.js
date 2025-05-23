const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const db = require('../utils/firebase');

const ADMIN_ROLE_ID = '1133753472966201555';
const BIRTHDAY_COLLECTION = 'birthdays';

function isValidDate(input) {
  const regex = /^(\d{1,2})[\/\.](\d{1,2})$/;
  const match = input.match(regex);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = {
  data: [
    new SlashCommandBuilder()
      .setName('הוסף_יום_הולדת')
      .setDescription('🎂 הוסף את יום ההולדת שלך לקבלת ברכה מ־שמעון!')
      .addStringOption(option =>
        option
          .setName('תאריך')
          .setDescription('📅 כתוב תאריך בפורמט 31/12 או 1.1')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('ימי_הולדת')
      .setDescription('📅 רשימת ימי הולדת לפי חודש'),

    new SlashCommandBuilder()
      .setName('היום_הולדת_הבא')
      .setDescription('🔮 גלה מי הבא שחוגג יום הולדת'),

    new SlashCommandBuilder()
      .setName('ימי_הולדת_חסרים')
      .setDescription('🛠️ רשימת חברים שעדיין לא עדכנו יום הולדת')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ],

  async execute(interaction) {
    const { commandName, member } = interaction;

    if (commandName === 'הוסף_יום_הולדת') {
      const input = interaction.options.getString('תאריך');
      const parsed = isValidDate(input);

      if (!parsed) {
        return interaction.reply({
          content: '❌ תאריך לא תקין. נסה משהו כמו `31/12` או `1.1`',
          ephemeral: true
        });
      }

      await db.collection(BIRTHDAY_COLLECTION).doc(member.id).set({
        birthday: parsed,
        fullName: member.displayName,
        addedBy: member.id,
        createdAt: new Date().toISOString()
      });

      return interaction.reply({
        content: `🎉 נשמר! נרשמת ליום הולדת ב־${parsed}`,
        ephemeral: true
      });
    }

    if (commandName === 'ימי_הולדת') {
      const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
      if (snapshot.empty) return interaction.reply('לא נמצאו ימי הולדת 🤷');

      const months = Array.from({ length: 12 }, () => []);
      snapshot.forEach(doc => {
        const data = doc.data();
        const [month, day] = data.birthday.split('-');
        months[parseInt(month) - 1].push(`📅 ${day}.${month} — ${data.fullName}`);
      });

      const embed = new EmbedBuilder()
        .setTitle('🎂 ימי הולדת בקהילה')
        .setColor('Purple');

      months.forEach((arr, i) => {
        if (arr.length > 0) {
          embed.addFields({ name: `חודש ${i + 1}`, value: arr.join('\n'), inline: false });
        }
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'היום_הולדת_הבא') {
      const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
      if (snapshot.empty) return interaction.reply('אין ימי הולדת בכלל 😢');

      const today = new Date();
      const nowDay = today.getDate();
      const nowMonth = today.getMonth() + 1;

      const upcoming = snapshot.docs
        .map(doc => {
          const { birthday, fullName } = doc.data();
          const [month, day] = birthday.split('-').map(Number);
          const date = new Date(today.getFullYear(), month - 1, day);
          if (month < nowMonth || (month === nowMonth && day < nowDay)) {
            date.setFullYear(today.getFullYear() + 1);
          }
          return { fullName, date };
        })
        .sort((a, b) => a.date - b.date)[0];

      return interaction.reply(`🎉 הקרוב ביותר לחגוג יום הולדת הוא **${upcoming.fullName}** בתאריך ${upcoming.date.toLocaleDateString('he-IL')}`);
    }

    if (commandName === 'ימי_הולדת_חסרים') {
      if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '⛔ אין לך הרשאה לפקודה זו.', ephemeral: true });
      }

      const guild = interaction.guild;
      await guild.members.fetch();
      const allMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(VERIFIED_ROLE_ID));
      const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
      const registeredIds = new Set(snapshot.docs.map(doc => doc.id));

      const missing = allMembers.filter(m => !registeredIds.has(m.id));
      const names = missing.map(m => `• ${m.displayName}`).join('\n') || 'כולם מעודכנים ✅';

      const embed = new EmbedBuilder()
        .setColor('DarkRed')
        .setTitle('🚫 משתמשים שעדיין לא הזינו יום הולדת')
        .setDescription(names);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

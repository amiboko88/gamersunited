const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const db = require('../utils/firebase');

const BIRTHDAY_COLLECTION = 'birthdays';

function parseBirthdayInput(input) {
  const regex = /^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})$/;
  const match = input.match(regex);
  if (!match) return null;

  let [_, day, month, year] = match;
  day = parseInt(day);
  month = parseInt(month);
  year = parseInt(year.length === 2 ? `19${year}` : year);

  const testDate = new Date(year, month - 1, day);
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const passed =
    now.getMonth() + 1 > month ||
    (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!passed) age--;

  if (age < 5 || age > 120) return null;
  return { day, month, year, age };
}

async function showBirthdayModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('birthday_modal')
    .setTitle('🎉 הוסף יום הולדת');

  const input = new TextInputBuilder()
    .setCustomId('birthday_input')
    .setLabel('הכנס תאריך בפורמט 31/12/1990 או 1.1.88')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('לדוגמה: 14/05/1993')
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleBirthdayModalSubmit(interaction, client) {
  const input = interaction.fields.getTextInputValue('birthday_input');
  const parsed = parseBirthdayInput(input);

  const userId = interaction.user.id;
  const doc = await db.collection(BIRTHDAY_COLLECTION).doc(userId).get();

  if (doc.exists) {
    return interaction.reply({
      content: '🔁 כבר הזנת תאריך יום הולדת בעבר. אין צורך להזין שוב.',
      ephemeral: true
    });
  }

  if (!parsed) {
    return interaction.reply({
      content: '❌ תאריך לא תקין. נסה פורמט כמו 31/12/1990 או 1.1.88',
      ephemeral: true
    });
  }

  const { day, month, year, age } = parsed;

  await db.collection(BIRTHDAY_COLLECTION).doc(userId).set({
    birthday: { day, month, year, age },
    fullName: interaction.member.displayName,
    addedBy: userId,
    createdAt: new Date().toISOString()
  });

  const embed = new EmbedBuilder()
    .setColor('Green')
    .setTitle('🎂 יום הולדת נרשם בהצלחה!')
    .setDescription(`תאריך: **${day}.${month}.${year}**\nגיל: **${age}**`)
    .setFooter({ text: 'שמעון תמיד זוכר 🎈' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  showBirthdayModal,
  handleBirthdayModalSubmit
};

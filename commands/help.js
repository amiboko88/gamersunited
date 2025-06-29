const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const generateHelpImage = require('../handlers/generateHelpImage');

const HELP_IMAGES = ['helpUser.png', 'helpBirthday.png'];
const ADMIN_IMAGES = ['helpAdmin.png'];

function getImageList(isAdmin) {
  return isAdmin ? [...HELP_IMAGES, ...ADMIN_IMAGES] : HELP_IMAGES;
}

function buildButtons(currentIndex, isAdmin) {
  const images = getImageList(isAdmin);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_prev_${currentIndex}`)
      .setLabel('⬅️ הקודם')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === 0),
    new ButtonBuilder()
      .setCustomId(`help_next_${currentIndex}`)
      .setLabel('הבא ➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex >= images.length - 1),
    new ButtonBuilder()
      .setCustomId(`help_ai_modal`)
      .setLabel('שאל את שמעון 🤖')
      .setStyle(ButtonStyle.Success)
  );
}

async function ensureImageExists(imageName) {
  const filePath = path.resolve(__dirname, `../images/${imageName}`);
  if (!fs.existsSync(filePath)) {
    console.log(`📸 ${imageName} לא נמצא – מייצר...`);
    await generateHelpImage(imageName.replace('.png', ''));
  }
  return filePath;
}

function getCommandsText(index, isAdmin) {
  const allSections = [
    {
      title: '👤 פקודות משתמש',
      commands: [
        '/אימות – אימות משתמש חדש ✅',
        '/מוזיקה – נגן שיר 🎵',
        '/פיפו – הפעל מצב פיפו 🎮',
        '/סאונדבורד – השמע סאונד מצחיק 🔊',
        '/מצטיין_שבוע – תצוגת מצטיינים 🏆'
      ]
    },
    {
      title: '🎂 פקודות ימי הולדת',
      commands: [
        '/הוסף_יום_הולדת – הוסף את היום שלך 🎂',
        '/ימי_הולדת – רשימת החוגגים הקרובים 📅',
        '/היום_הולדת_הבא – מי הכי קרוב לחגוג? 🔜',
        '/ימי_הולדת_חסרים – מי לא עדכן עדיין? ⏳'
      ]
    },
    {
      title: '👑 פקודות מנהלים',
      commands: [
        '/updaterules – עדכון חוקים 🔧',
        '/rulestats – אישרו חוקים 📑',
        '/tts – בדיקת תווים 🗣️',
        '/leaderboard – שליחת לוח תוצאות 🏅',
        '/הקלט – התחלת הקלטת שיחה 🎙️',
        '/השמע_אחרון – נגן את ההקלטה האחרונה ▶️',
        '/רשימת_הקלטות – כל ההקלטות שלך 📂',
        '/מחק_הקלטות – ניקוי ההקלטות 🧹'
      ]
    }
  ];

  const section = isAdmin
    ? allSections[index]
    : allSections.slice(0, 2)[index];

  if (!section) return '';

  return `**${section.title}**\n${section.commands.map(c => `• ${c}`).join('\n')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('מרכז עזרה ברור ונגיש לפי תפקיד'),

  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has('Administrator');
    const images = getImageList(isAdmin);
    const imageName = images[0];
    const file = await ensureImageExists(imageName);
    const attachment = new AttachmentBuilder(file);
    const buttons = buildButtons(0, isAdmin);

    const roleText = isAdmin
      ? '🎩 אתה מזוהה כ־Admin'
      : '🙋‍♂️ אתה מזוהה כמשתמש רגיל';

    const commandsText = getCommandsText(0, isAdmin);

    await interaction.reply({
      content: `${roleText}\n\n${commandsText}`,
      files: [attachment],
      components: [buttons],
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    if (!interaction.isButton()) return false;

    if (interaction.customId === 'help_ai_modal') {
      await interaction.reply({
        content: '🧠 כתוב את השאלה שלך כאן, שמעון יגיב בהתאם 😉',
        ephemeral: true
      });
      return true;
    }

    const isAdmin = interaction.member.permissions.has('Administrator');
    const [action, , rawIndex] = interaction.customId.split('_');
    const currentIndex = parseInt(rawIndex);
    const images = getImageList(isAdmin);
    const direction = interaction.customId.includes('next') ? 1 : -1;
    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= images.length) return true;

    const imageName = images[newIndex];
    const file = await ensureImageExists(imageName);
    const attachment = new AttachmentBuilder(file);
    const buttons = buildButtons(newIndex, isAdmin);
    const commandsText = getCommandsText(newIndex, isAdmin);

    await interaction.update({
      content: commandsText,
      files: [attachment],
      components: [buttons],
      ephemeral: true
    });

    return true;
  }
};

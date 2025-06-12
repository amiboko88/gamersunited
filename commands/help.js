const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const generateHelpImageByName = require('../handlers/generateHelpImage');

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
    await generateHelpImageByName(imageName.replace('.png', ''));
  }
  return filePath;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('מרכז עזרה אינטראקטיבי עם ניווט ותמונות'),

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

    await interaction.reply({
      content: `${roleText}\nהשתמש בכפתורים למטה כדי לדפדף בין קטגוריות.`,
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

    await interaction.update({
      content: `📘 עזרה – עמוד ${newIndex + 1} מתוך ${images.length}`,
      files: [attachment],
      components: [buttons],
      ephemeral: true
    });

    return true;
  }
};

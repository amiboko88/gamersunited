const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ComponentType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// רשימת כל התמונות לפי הסדר
const HELP_IMAGES = ['helpUser.png', 'helpBirthday.png'];
const ADMIN_IMAGES = ['helpAdmin.png'];

function getHelpImageByIndex(index, isAdmin) {
  const images = isAdmin ? [...HELP_IMAGES, ...ADMIN_IMAGES] : HELP_IMAGES;
  return {
    file: path.resolve(__dirname, `../images/${images[index]}`),
    index,
    total: images.length
  };
}

function buildButtons(currentIndex, isAdmin) {
  const images = isAdmin ? [...HELP_IMAGES, ...ADMIN_IMAGES] : HELP_IMAGES;

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('מרכז עזרה אינטראקטיבי עם ניווט ותמונות'),

  async execute(interaction) {
    const member = interaction.member;
    const isAdmin = member.permissions.has('Administrator');
    const { file, index } = getHelpImageByIndex(0, isAdmin);

    const attachment = new AttachmentBuilder(file);
    const buttons = buildButtons(index, isAdmin);

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

    const member = interaction.member;
    const isAdmin = member.permissions.has('Administrator');
    const [action, , rawIndex] = interaction.customId.split('_');
    const currentIndex = parseInt(rawIndex);

    if (interaction.customId === 'help_ai_modal') {
      await interaction.reply({
        content: '🧠 כתוב את השאלה שלך כאן, שמעון יגיב בהתאם 😉',
        ephemeral: true
      });
      return true;
    }

    if (action === 'help') {
      const images = isAdmin ? [...HELP_IMAGES, ...ADMIN_IMAGES] : HELP_IMAGES;
      const direction = interaction.customId.includes('next') ? 1 : -1;
      const newIndex = currentIndex + direction;

      if (newIndex < 0 || newIndex >= images.length) return true;

      const newFile = path.resolve(__dirname, `../images/${images[newIndex]}`);
      const newAttachment = new AttachmentBuilder(newFile);
      const newButtons = buildButtons(newIndex, isAdmin);

      await interaction.update({
        content: `📘 עזרה – עמוד ${newIndex + 1} מתוך ${images.length}`,
        files: [newAttachment],
        components: [newButtons],
        ephemeral: true
      });
      return true;
    }

    return false;
  }
};

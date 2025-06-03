const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

const HELP_CATEGORIES = [
  {
    id: 'all',
    name: '📖 כל הפקודות',
    emoji: '📖',
    commands: [
      { name: '/עזרה', description: 'מרכז עזרה אינטראקטיבי 🧩' },
      { name: '/אימות', description: 'אימות משתמש חדש ✅' },
      { name: '/מוזיקה', description: 'נגן שיר 🎵' },
      { name: '/פיפו', description: 'הפעל מצב פיפו 🎮' },
      { name: '/סאונדבורד', description: 'השמע סאונד מצחיק 🔊' },
      { name: '/מצטיינים', description: 'מצטייני השבוע 🏆' },
      { name: '/הוסף_יום_הולדת', description: 'הוסף יום הולדת 🎂' },
      { name: '/ימי_הולדת', description: 'רשימת ימי הולדת קרובים 📅' },
      { name: '/היום_הולדת_הבא', description: 'מי חוגג הכי קרוב? 🔜' },
      { name: '/ימי_הולדת_חסרים', description: 'מי עוד לא מסר תאריך? ⏳' },
      { name: '/leaderboard', description: 'לוח תוצאות 🏅' },
      { name: '/activity', description: 'לוח פעילות 🗓️' },
      { name: '/tts', description: 'הפעלת שמעון TTS 🗣️' },
      { name: '/updaterules', description: 'עדכון חוקים 🔧 (מנהלים)' },
      { name: '/rulestats', description: 'סטטיסטיקות חוקים 📑 (מנהלים)' }
    ]
  },
  {
    id: 'user',
    name: '👤 פקודות משתמש',
    emoji: '👤',
    commands: [
      { name: '/אימות', description: 'אימות משתמש חדש ✅' },
      { name: '/מוזיקה', description: 'נגן שיר 🎵' },
      { name: '/פיפו', description: 'הפעל מצב פיפו 🎮' },
      { name: '/סאונדבורד', description: 'השמע סאונד מצחיק 🔊' },
      { name: '/מצטיינים', description: 'מצטייני השבוע 🏆' },
      { name: '/הוסף_יום_הולדת', description: 'הוסף יום הולדת 🎂' },
      { name: '/ימי_הולדת', description: 'רשימת ימי הולדת קרובים 📅' },
      { name: '/יום_הולדת_הבא', description: 'מי חוגג הכי קרוב? 🔜' },
      { name: '/ימי_הולדת_חסרים', description: 'מי עוד לא מסר תאריך? ⏳' }
    ]
  },
  {
    id: 'admin',
    name: '👑 פקודות מנהלים',
    emoji: '👑',
    commands: [
      { name: '/updaterules', description: 'עדכון חוקים 🔧' },
      { name: '/rulestats', description: 'סטטיסטיקות חוקים 📑' },
      { name: '/tts', description: ' TTS 🗣️' },
      { name: '/leaderboard', description: 'לוח תוצאות 🏅' },
      { name: '/activity', description: 'לוח פעילות 🗓️' }

    ]
  }
];

function buildEmbed(categoryId = 'all') {
  const category = HELP_CATEGORIES.find(c => c.id === categoryId) || HELP_CATEGORIES[0];

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription('בחר/י פקודה כדי להפעיל אותה או לקבל הסבר מפורט.\n\n**פקודות המנהלים זמינות למנהלי השרת בלבד!**')
    .setFields(
      category.commands.map(cmd => ({
        name: `**${cmd.name}**`,
        value: `${cmd.description}`,
        inline: false,
      }))
    )
    .setFooter({ text: 'שמעון | מרכז עזרה', iconURL: 'https://cdn.discordapp.com/emojis/1120791263410348032.webp?size=96&quality=lossless' })
    .setTimestamp();
}

function buildActionRow(selected = 'all') {
  return new ActionRowBuilder().addComponents(
    ...HELP_CATEGORIES.map(cat =>
      new ButtonBuilder()
        .setCustomId(`help_category_${cat.id}`)
        .setLabel(cat.name)
        .setStyle(selected === cat.id ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji(cat.emoji)
    ),
    new ButtonBuilder()
      .setCustomId('help_ai_modal')
      .setLabel('שאל את שמעון 🤖')
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('מרכז עזרה אינטראקטיבי 🧩'),

  async execute(interaction) {
    await interaction.reply({
      embeds: [buildEmbed()],
      components: [buildActionRow()],
      ephemeral: true // עזרה רק לשולח
    });
  },

  // טיפול בכפתורים ומודאל AI
  async handleButton(interaction) {
    if (!interaction.isButton() && !(interaction.isModalSubmit && interaction.customId === 'help_ai_modal')) return false;

    if (interaction.customId.startsWith('help_category_')) {
      const catId = interaction.customId.replace('help_category_', '');
      await interaction.update({
        embeds: [buildEmbed(catId)],
        components: [buildActionRow(catId)],
        ephemeral: true
      });
      return true;
    }

    if (interaction.customId === 'help_ai_modal') {
      // פתיחת מודאל עם שאלה לשמעון (AI)
      await interaction.reply({
        content: 'מגניב! שלח/י כאן כל שאלה, שמעון ינסה לעזור/להגיב עם הומור 😉',
        ephemeral: true
      });
      return true;
    }

    return false;
  }
};

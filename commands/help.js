const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require('discord.js');
const { getShimonReply } = require('../handlers/helpai'); // פה החיבור למנוע החכם שלך

// קטגוריות עזרה
const HELP_CATEGORIES = [
  {
    id: 'general',
    name: 'כללי',
    emoji: '🧩',
    commands: [
      { name: 'activity', emoji: '🗓️', desc: 'לוח פעילות שבועי' },
      { name: 'leaderboard', emoji: '🏆', desc: 'לוח תוצאות גיימרים' },
      { name: 'mvp', emoji: '🏅', desc: 'מצטיין השבוע' }
    ]
  },
  {
    id: 'voice',
    name: 'קול ו-TTS',
    emoji: '🎤',
    commands: [
      { name: 'tts', emoji: '🗣️', desc: 'הפעלת מצב דיבור' },
      { name: 'soundboard', emoji: '🎶', desc: 'השמע קטעים מצחיקים' }
    ]
  },
  {
    id: 'community',
    name: 'קהילה',
    emoji: '👥',
    commands: [
      { name: 'verify', emoji: '✅', desc: 'אימות משתמש' },
      { name: 'refreshRules', emoji: '♻️', desc: 'רענון חוקים' },
      { name: 'rulesStats', emoji: '📑', desc: 'סטטיסטיקת חוקים' }
    ]
  },
  {
    id: 'fun',
    name: 'Fun',
    emoji: '🥳',
    commands: [
      { name: 'song', emoji: '🎵', desc: 'נגן שיר' },
      { name: 'fifo', emoji: '🎮', desc: 'מצב פיפו' }
    ]
  },
  {
    id: 'birthday',
    name: 'ימי הולדת',
    emoji: '🎂',
    commands: [
      { name: 'addbirthday', emoji: '🎂', desc: 'הוסף יום הולדת' },
      { name: 'birthdays', emoji: '📅', desc: 'ימי הולדת קרובים' },
      { name: 'nextbirthday', emoji: '⏭️', desc: 'מי חוגג מחר?' }
    ]
  }
];

// פונקציה שמחלקת כפתורים תמיד לשורות של עד 5
function chunkButtonsToRows(buttonsArray, maxPerRow = 5) {
  const rows = [];
  for (let i = 0; i < buttonsArray.length; i += maxPerRow) {
    const row = new ActionRowBuilder().addComponents(
      ...buttonsArray.slice(i, i + maxPerRow)
    );
    rows.push(row);
  }
  return rows;
}

// בניית Embed לקטגוריה
function buildCategoryEmbed(categoryId) {
  let cat = HELP_CATEGORIES.find(c => c.id === categoryId) || HELP_CATEGORIES[0];
  let cmds = cat.commands;
  const commandsDesc = cmds.length
    ? cmds.map(cmd => `**/${cmd.name}** ${cmd.emoji} — ${cmd.desc}`).join('\n')
    : 'לא נמצאו פקודות תואמות 🙁';
  return new EmbedBuilder()
    .setColor(`#${Math.floor(Math.random()*16777215).toString(16)}`)
    .setTitle(`${cat.emoji} ${cat.name} — מרכז עזרה`)
    .setDescription(commandsDesc)
    .setFooter({ text: 'תוכל לשאול כל שאלה בלחיצה על "שאל את שמעון" 👇' });
}

// בניית שורות כפתורים חכמה (לא עובר 5 בשורה)
function buildCategoryButtons(selectedId) {
  const categoryButtons = HELP_CATEGORIES.map(cat =>
    new ButtonBuilder()
      .setCustomId(`help_${cat.id}`)
      .setLabel(cat.name)
      .setEmoji(cat.emoji)
      .setStyle(cat.id === selectedId ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  // כפתור שאל את שמעון (AI)
  const askShimon = new ButtonBuilder()
    .setCustomId('help_askai')
    .setLabel('שאל את שמעון (AI)')
    .setEmoji('🤖')
    .setStyle(ButtonStyle.Success);

  // מחלק לשורות של 5, ומוסיף שורה לשאלת שמעון
  const rows = chunkButtonsToRows(categoryButtons);
  rows.push(new ActionRowBuilder().addComponents(askShimon));
  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('מרכז עזרה חכם — עזרה, טיפים, שאלות לשמעון'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [buildCategoryEmbed('general')],
      components: buildCategoryButtons('general'),
      flags: 64
    });
  },
  async handleButton(interaction) {
    // טיפול בלחיצה על כפתורי עזרה
    if (interaction.isButton() && interaction.customId.startsWith('help_')) {
      const category = interaction.customId.replace('help_', '');
      if (category === 'askai') {
        // פתח Modal לשאלה ל-AI
        const modal = new ModalBuilder()
          .setCustomId('help_ai_modal')
          .setTitle('שאל את שמעון (AI)');

        const input = new TextInputBuilder()
          .setCustomId('help_ai_q')
          .setLabel('מה תרצה לשאול?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('לדוג: איך מוסיפים יום הולדת?');

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
      }
      // קטגוריה רגילה
      await interaction.update({
        embeds: [buildCategoryEmbed(category)],
        components: buildCategoryButtons(category),
        flags: 64
      });
      return true;
    }

    // טיפול בשאלה ל־AI (Modal)
    if (
      interaction.type === InteractionType.ModalSubmit &&
      interaction.customId === 'help_ai_modal'
    ) {
      const userText = interaction.fields.getTextInputValue('help_ai_q');
      await interaction.deferReply({ flags: 64 });

      // קריאה חכמה ל-AI דרך helpai.js!
      const aiReply = await getShimonReply({ text: userText, displayName: interaction.user.displayName });

      await interaction.editReply({
        content: `🤖 **שמעון עונה:**\n${aiReply}`
      });
      return true;
    }
    return false;
  }
};

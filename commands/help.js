const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');

// מזהה תפקיד אדמין (אפשר לשנות ל-ID שלך!)
const ADMIN_ROLE_NAME = '1133753472966201555'; // אפשר גם ID

// קטגוריות (יש גם פקודות ניהול שרק אדמין יראה)
const HELP_CATEGORIES = [
  {
    id: 'general',
    name: 'כללי',
    emoji: '🧩',
    adminOnly: false,
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
    adminOnly: false,
    commands: [
      { name: 'tts', emoji: '🗣️', desc: 'הפעלת מצב דיבור' },
      { name: 'soundboard', emoji: '🎶', desc: 'השמע קטעים מצחיקים' }
    ]
  },
  {
    id: 'community',
    name: 'קהילה',
    emoji: '👥',
    adminOnly: false,
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
    adminOnly: false,
    commands: [
      { name: 'song', emoji: '🎵', desc: 'נגן שיר' },
      { name: 'fifo', emoji: '🎮', desc: 'מצב פיפו' }
    ]
  },
  {
    id: 'birthday',
    name: 'ימי הולדת',
    emoji: '🎂',
    adminOnly: false,
    commands: [
      { name: 'addbirthday', emoji: '🎂', desc: 'הוסף יום הולדת' },
      { name: 'birthdays', emoji: '📅', desc: 'ימי הולדת קרובים' },
      { name: 'nextbirthday', emoji: '⏭️', desc: 'מי חוגג מחר?' }
    ]
  },
  {
    id: 'admin',
    name: 'ניהול',
    emoji: '🛡️',
    adminOnly: true, // יוצג רק למנהלים
    commands: [
      { name: 'נקה', emoji: '🧹', desc: 'ניקוי ערוצים' },
      { name: 'תן_תפקיד', emoji: '🛠️', desc: 'הענקת תפקיד' },
      { name: 'refreshRules', emoji: '♻️', desc: 'עדכון חוקים ידני' }
    ]
  }
];

// טיפים אקראיים עם "אנימציה" של אימוג'י
const TIPS = [
  'טיפ: השתמש ב־/leaderboard כדי לעקוב אחרי ההתקדמות!',
  'חדש: אפשר להפעיל קול אמיתי בערוץ עם /tts 🎤',
  'FIFO – יותר חברים, יותר נצחונות! 🎮',
  'שאלות? נסה את כפתור "שאל את שמעון" 🤖',
  'בכל שאלה, תמיד אפשר לפנות לצוות 👨‍💻'
];

// בניית Embed לפי קטגוריה (ורשימת פקודות מותאמת להרשאות)
function buildCategoryEmbed(categoryId, isAdmin, filter = null) {
  let cat = HELP_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) cat = HELP_CATEGORIES[0];

  // אפשרות Search: מסנן פקודות לפי טקסט חופשי (אם קיים)
  let cmds = cat.commands;
  if (filter) {
    cmds = cmds.filter(cmd =>
      cmd.name.toLowerCase().includes(filter) ||
      cmd.desc.toLowerCase().includes(filter)
    );
  }

  // אם קטגוריית admin – רק אם אתה אדמין
  if (cat.adminOnly && !isAdmin) return null;

  const commandsDesc = cmds.length
    ? cmds.map(cmd => `**/${cmd.name}** ${cmd.emoji} — ${cmd.desc}`).join('\n')
    : 'לא נמצאו פקודות תואמות 🙁';

  return new EmbedBuilder()
    .setColor(`#${Math.floor(Math.random()*16777215).toString(16)}`) // צבע רנדומלי ל-"אנימציה"
    .setTitle(`${cat.emoji} ${cat.name} — Help Center 2026`)
    .setDescription(commandsDesc)
    .setFooter({ text: TIPS[Math.floor(Math.random() * TIPS.length)] });
}

// בניית כפתורי קטגוריות + כפתור תמיכה + שאל את שמעון
function buildCategoryButtons(selectedId, isAdmin) {
  const row = new ActionRowBuilder();
  HELP_CATEGORIES.forEach(cat => {
    if (!cat.adminOnly || isAdmin)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`help_${cat.id}`)
          .setLabel(cat.name)
          .setEmoji(cat.emoji)
          .setStyle(cat.id === selectedId ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
  });
  // "צור קשר" + "שאל את שמעון"
  return [
    row,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('help_contact')
        .setLabel('צור קשר עם צוות')
        .setEmoji('📞')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('help_askai')
        .setLabel('שאל את שמעון')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// בניית תפריט Search (Select Menu)
function buildSearchMenu() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_search')
        .setPlaceholder('חפש פקודה לפי שם...')
        .addOptions(
          HELP_CATEGORIES.flatMap(cat =>
            cat.commands.map(cmd => ({
              label: `/${cmd.name}`,
              description: cmd.desc,
              value: `${cat.id}_${cmd.name}`,
              emoji: cmd.emoji
            }))
          )
        )
    )
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('Help Center מתקדם, חכם וצבעוני'),

  async execute(interaction) {
    // זיהוי אם המשתמש אדמין (רול/הרשאה)
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const isAdmin = member && (member.permissions.has('Administrator') ||
      member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME));
    // התחלה בקטגוריה ראשית
    await interaction.reply({
      embeds: [buildCategoryEmbed('general', isAdmin)],
      components: [
        ...buildCategoryButtons('general', isAdmin),
        ...buildSearchMenu()
      ],
      flags: 64
    });
  },

  async handleButton(interaction) {
    // קטגוריות
    if (interaction.isButton()) {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const isAdmin = member && (member.permissions.has('Administrator') ||
        member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME));

      // דפדוף בין קטגוריות
      if (interaction.customId.startsWith('help_')) {
        const category = interaction.customId.replace('help_', '');
        if (category === 'contact') {
          // צור קשר: שלח DM למנהל (או פינג לערוץ STAFF)
          const staffRole = interaction.guild.roles.cache.find(r => r.name === 'STAFF');
          if (staffRole) {
            await interaction.reply({
              content: `התקבלה בקשה לצור קשר! צוות ${staffRole} יפנה אליך בקרוב.`,
              flags: 64
            });
          } else {
            await interaction.reply({
              content: `לא נמצא צוות מנהלים. פנה ישירות למנהל השרת.`,
              flags: 64
            });
          }
          return true;
        }
        if (category === 'askai') {
          // "שאל את שמעון" (דוגמה: בוט עונה בצורה חכמה)
          await interaction.reply({
            content: `🤖 שמעון: תרגיש חופשי לשאול כל שאלה (לדוגמה: "איך מנקים חדר?" או "מה זה פיפו?")\n*בפיתוח, בקרוב תצא גרסה עם AI אמיתי!*`,
            flags: 64
          });
          return true;
        }
        // דפדוף בין קטגוריות רגיל
        await interaction.update({
          embeds: [buildCategoryEmbed(category, isAdmin)],
          components: [
            ...buildCategoryButtons(category, isAdmin),
            ...buildSearchMenu()
          ],
          flags: 64
        });
        return true;
      }
    }
    // חיפוש (Select Menu)
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_search') {
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const isAdmin = member && (member.permissions.has('Administrator') ||
        member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME));
      const [catId, cmdName] = interaction.values[0].split('_');
      const cat = HELP_CATEGORIES.find(c => c.id === catId);
      if (!cat || (cat.adminOnly && !isAdmin)) {
        await interaction.reply({
          content: 'אין לך הרשאה לראות פקודה זו.',
          flags: 64
        });
        return true;
      }
      const cmd = cat.commands.find(c => c.name === cmdName);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#b12aff')
            .setTitle(`${cmd.emoji} /${cmd.name}`)
            .setDescription(cmd.desc)
            .setFooter({ text: 'נשלף מתוך חיפוש' })
        ],
        flags: 64
      });
      return true;
    }
    return false;
  }
};

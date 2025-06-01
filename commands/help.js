// commands/help.js – פקודת עזרה עם כפתורים (תומך 5 כפתורים בשורה, דיסקורד.js v14+)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const HELP_CATEGORIES = [
  {
    id: 'general',
    label: 'עזרה כללית',
    emoji: '💡',
    description: 'הסבר קצר על השימוש בבוט ושאלות נפוצות.'
  },
  {
    id: 'tts',
    label: 'פקודות TTS',
    emoji: '🗣️',
    description: 'כל מה שצריך לדעת על טקסט לקול – איך לגרום לבוט לדבר, התאמה אישית ועוד.'
  },
  {
    id: 'clean',
    label: 'ניקוי חדרים',
    emoji: '🧹',
    description: 'איך לנקות ערוצים/חדרים מהודעות בלחיצה אחת.'
  },
  {
    id: 'admin',
    label: 'פקודות ניהול',
    emoji: '🛠️',
    description: 'פקודות שרק מנהלים יכולים להפעיל: תפקידים, ניהול, הגדרות.'
  },
  {
    id: 'soundboard',
    label: 'סאונדבורד',
    emoji: '🎵',
    description: 'השמעת קטעי סאונד/אפקטים מצחיקים דרך הבוט.'
  },
  {
    id: 'mvp',
    label: 'MVP',
    emoji: '🏅',
    description: 'מידע וסטטיסטיקות על המצטיינים השבועיים (MVP), פקודות הצפייה ועוד.'
  },
  {
    id: 'check',
    label: 'בדיקת מערכת',
    emoji: '🩺',
    description: 'בדוק אם הבוט פעיל, רץ כמו שצריך ומה מצבו.'
  }
];

// הסברים לכל קטגוריה
const HELP_CONTENT = {
  general: `🤖 **עזרה כללית – FIFO BOT**
הבוט נבנה במיוחד עבור קהילת גיימרים בוגרת.  
• לקבלת עזרה – בחר אחת מהקטגוריות שלמטה.
• פקודות ניהול זמינות למנהלים בלבד.
• שאלות? מוזמנים ליצור קשר עם הצוות.`,

  tts: `🗣️ **פקודות TTS (דיבור אוטומטי)**
• כשאתה נכנס לערוץ FIFO – הבוט יזהה אותך ויקריא משפט מצחיק.
• אפשר להתאים פרופיל אישי – פנה להנהלה.
• TTS בעברית בלבד, אפשר לבחור טון/הומור.`,

  clean: `🧹 **ניקוי חדרים**
• השתמש בפקודת \`/נקה\` כדי למחוק הודעות בצ'אט.
• ניתן לבחור כמה הודעות למחוק (ברירת מחדל: 10).
• שים לב – מנהלים בלבד!`,

  admin: `🛠️ **פקודות ניהול**
• \`/תן_תפקיד\` – הוספת תפקיד למשתמש
• \`/נקה\` – ניקוי חדרים
• \`/קבע_חוקים\` – עדכון חוקים ראשיים
ועוד פקודות ניהול זמינות – ראה תיעוד.`,

  soundboard: `🎵 **סאונדבורד (\`/סאונד\`)**
• בחר סאונד מהתפריט – הבוט ישמיע אותו בערוץ הקולי.
• כל משתמש יכול להשתמש פעם בדקה (Cooldown).
• רוצים להוסיף סאונד? שלחו בקשה לצוות!`,

  mvp: `🏅 **MVP – מצטיין השבוע**
• בכל שבוע נבחר המשתמש שהכי הרבה זמן בערוץ FIFO.
• סטטיסטיקות ועדכונים יופיעו בפקודת \`/mvp\`.
• המצטיין יקבל תפקיד צבעוני ופרגון בערוץ הראשי!`,

  check: `🩺 **בדיקת מערכת**
• הפקודה \`/בדוק\` מאשרת שהבוט פועל תקין.
• אפשר להפעיל אותה בכל עת לבדיקת זמינות וחיבור.`
};

// 👇 חלוקה לשורות – כל שורה עד 5 כפתורים!
function buildHelpButtons(selectedId = 'general') {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  HELP_CATEGORIES.forEach((cat, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_${cat.id}`)
        .setLabel(cat.label)
        .setEmoji(cat.emoji)
        .setStyle(cat.id === selectedId ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  });
  if (currentRow.components.length > 0) rows.push(currentRow);
  return rows;
}

function buildHelpEmbed(selectedId = 'general') {
  const cat = HELP_CATEGORIES.find(c => c.id === selectedId);
  return new EmbedBuilder()
    .setColor('#2b2d31')
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(HELP_CONTENT[selectedId])
    .setFooter({ text: 'GAMERS UNITED IL • מערכת עזרה בעברית' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('עזרה')
    .setDescription('צפייה בכל הפקודות, הסברים ושאלות נפוצות.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [buildHelpEmbed()],
      components: buildHelpButtons(),
      ephemeral: true // אתה יכול להחליף ל-flags: 64 אם תרצה
    });
  },
  // האנדלר של הכפתורים (יש להוסיף לאירוע interactionCreate הראשי!)
  async handleButton(interaction) {
    if (
      !interaction.isButton() ||
      !interaction.customId.startsWith('help_')
    ) return false;

    const selectedId = interaction.customId.replace('help_', '');
    if (!HELP_CONTENT[selectedId]) return false;

    await interaction.update({
      embeds: [buildHelpEmbed(selectedId)],
      components: buildHelpButtons(selectedId),
      ephemeral: true
    });

    return true;
  }
};

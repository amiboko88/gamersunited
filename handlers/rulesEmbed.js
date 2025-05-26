const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase');

const RULES_CHANNEL_ID = '1375414950683607103';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const BANNERS_DIR = path.join(__dirname, '../assets');
const RULES_META_PATH = 'rulesMeta/config';
const ACCEPTED_COLLECTION = 'rulesAccepted';

// 🖼️ באנר שבועי
function getBannerPath() {
  const banners = fs.readdirSync(BANNERS_DIR).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(BANNERS_DIR, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(BANNERS_DIR, banners[index]);
}

// 📘 Embed מעוצב
function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor('#2f3136')
    .setTitle('חוקי GAMERS UNITED IL')
    .setDescription('הקפד לקרוא את כל הכללים. בלחיצה על הכפתור למטה אתה מאשר שקראת והסכמת אליהם.')
    .addFields(
      {
        name: '**כללי** 🎮',
        value: '• יש לשמור על תקשורת מכבדת ועניינית\n• שיח פוגעני או מתסיס לא יתקבל'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**צ׳אט** 💬',
        value: '• לא נאפשר קללות, ספאם או קישורים מזיקים\n• כתיבה בשפה נאותה – חובה'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**חדרי קול** 🎧',
        value: '• אין להשמיע רעשים או מוזיקה ללא הסכמה\n• מומלץ להשתמש ב־Push-to-Talk או להשתיק את עצמך בעת הצורך'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**שימוש בבוטים** 🤖',
        value: '• יש להשתמש בתכונות הבוט בצורה הוגנת\n• אין להציף פקודות או לנצל אותן לרעה'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**ענישה ודיווחים** ⚠️',
        value: '• הפרות יתועדו ויטופלו בהתאם\n• שלבי תגובה: באן / קיק ← השעיה זמנית ← אזהרה\n• ניתן לדווח בערוץ התמיכה בלבד'
      }
    )
    .setThumbnail('attachment://logo.png')
    .setImage('attachment://banner.png')
    .setFooter({ text: 'עודכן אוטומטית', iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

// כפתור אימות אישי
async function buildAcceptButton(userId) {
  const doc = await db.collection(ACCEPTED_COLLECTION).doc(userId).get();
  const accepted = doc.exists;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setLabel(accepted ? '🔒 אושר' : '✅ אשר חוקים')
      .setStyle(accepted ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(accepted)
  );
}

// יצירת / עדכון הודעה
async function setupRulesMessage(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const metaRef = db.doc(RULES_META_PATH);
  const metaSnap = await metaRef.get();

  const embed = buildRulesEmbed();
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');
  const row = await buildAcceptButton(client.user.id); // הצגה כללית

  try {
    if (metaSnap.exists) {
      const message = await channel.messages.fetch(metaSnap.data().messageId);
      await message.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      return;
    }
  } catch {
    console.warn('⚠️ ההודעה לא קיימת או לא ניתנת לעריכה. שולח חדשה.');
  }

  const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
  await metaRef.set({ messageId: sent.id });
}

// עדכון שבועי של הבאנר
function startWeeklyRulesUpdate(client) {
  const cron = require('node-cron');
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await setupRulesMessage(client);
  });
}

// טיפול בלחיצה
async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;
  if (interaction.customId !== 'accept_rules') return;

  await interaction.deferUpdate(); // מחזיק את האינטראקציה בחיים

  const ref = db.collection(ACCEPTED_COLLECTION).doc(userId);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      userId,
      displayName: interaction.member?.displayName || interaction.user.username,
      acceptedAt: new Date().toISOString()
    });

    try {
      await interaction.user.send('📘 תודה שאישרת את חוקי הקהילה!');
    } catch {
      console.warn(`⚠️ לא ניתן לשלוח DM ל־${interaction.user.username}`);
    }
  }

  setTimeout(async () => {
    const row = await buildAcceptButton(userId);
    try {
      await interaction.message.edit({ components: [row] });
    } catch (err) {
      console.error('❌ שגיאה בעדכון הכפתור:', err);
    }
  }, 500); // עיכוב קצר למניעת שגיאות race
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

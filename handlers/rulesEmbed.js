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

function getBannerPath() {
  const banners = fs.readdirSync(BANNERS_DIR).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(BANNERS_DIR, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(BANNERS_DIR, banners[index]);
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor('#2f3136')
    .setTitle('חוקי GAMERS UNITED IL')
    .setDescription('הקפד לקרוא את הכללים. בלחיצה על הכפתור אתה מאשר שקראת והסכמת להם.')
    .addFields(
      {
        name: '**כללי** 🎮',
        value: '• תקשורת מכבדת ועניינית בלבד\n• שיח פוגעני לא יתקבל'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**צ׳אט** 💬',
        value: '• ללא קללות, ספאם או קישורים מזיקים\n• חובה לכתוב בשפה נאותה'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**חדרי קול** 🎧',
        value: '• אין להשמיע רעשים או מוזיקה ללא הסכמה\n• מומלץ Push-to-Talk'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**שימוש בבוטים** 🤖',
        value: '• שימוש הוגן בלבד\n• אין להציף פקודות או לנצל תכונות לרעה'
      },
      { name: '\u200B', value: '\u200B' },
      {
        name: '**ענישה ודיווחים** ⚠️',
        value: '• הפרות יתועדו ויטופלו בהתאם\n• באן / קיק ← השעיה ← אזהרה\n• דיווחים בערוץ התמיכה בלבד'
      }
    )
    .setThumbnail('attachment://logo.png')
    .setImage('attachment://banner.png')
    .setFooter({ text: 'עודכן אוטומטית', iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

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

// שליחה כפולה: Embed ואז כפתור
async function setupRulesMessage(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const banner = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logo = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const embed = buildRulesEmbed();
  const embedMsg = await channel.send({ embeds: [embed], files: [banner, logo] });

  // שמירת ID לצורך תחזוקה
  const metaRef = db.doc(RULES_META_PATH);
  await metaRef.set({ messageId: embedMsg.id });

  // שליחת כפתור לכל אחד שיוצג כפי יכולתו
  const row = await buildAcceptButton(client.user.id);
  await channel.send({ components: [row] });
}

function startWeeklyRulesUpdate(client) {
  const cron = require('node-cron');
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await setupRulesMessage(client);
  });
}

async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;
  if (interaction.customId !== 'accept_rules') return;

  await interaction.deferUpdate();

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

  // שליחת כפתור אישי מעודכן
  const row = await buildAcceptButton(userId);

  setTimeout(async () => {
    try {
      await interaction.message.edit({ components: [row] });
    } catch (err) {
      console.error('❌ שגיאה בעדכון כפתור אישי:', err);
    }
  }, 500);
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

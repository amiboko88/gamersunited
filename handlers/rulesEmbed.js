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
const ACCEPTED_COLLECTION = 'rulesAccepted';
const META_COLLECTION = 'rulesMeta';
const META_DOC_ID = 'latest';
const REACTION_EMOJI = '📜';

// 🔄 באנר שבועי מתחלף
function getBannerPath() {
  const banners = fs.readdirSync(BANNERS_DIR).filter(f =>
    f.startsWith('banner') && f.endsWith('.png')
  );
  if (!banners.length) return path.join(BANNERS_DIR, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(BANNERS_DIR, banners[index]);
}

// 🧱 Embed חוקי הקהילה
function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor('#2f3136')
    .setTitle('חוקי  GAMERS UNITED IL')
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
        value: '• הפרות יתועדו ויטופלו בהתאם\n• באן / קיק ➡️ השעיה ➡️ אזהרה\n• דיווחים בערוץ התמיכה בלבד'
      }
    )
    .setThumbnail('attachment://logo.png')
    .setImage('attachment://banner.png')
    .setFooter({ text: 'עודכן אוטומטית', iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

// 🔘 יצירת כפתור אישור חוקים
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

// 📜 שליחת Embed ציבורי – רק אם לא קיים
async function sendPublicRulesEmbed(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const rulesDoc = db.collection(META_COLLECTION).doc(META_DOC_ID);
  const existing = await rulesDoc.get();

  if (existing.exists) {
    const data = existing.data();
    try {
      const message = await channel.messages.fetch(data.messageId);
      if (message) return; // קיימת הודעה – לא שולחים שוב
    } catch {
      console.warn('⚠️ הודעת חוקים לא קיימת עוד – שולחים חדשה');
    }
  }

  const embed = buildRulesEmbed();
  const banner = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logo = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const sentMessage = await channel.send({
    embeds: [embed],
    files: [banner, logo]
  });

  try {
    await sentMessage.react(REACTION_EMOJI);
  } catch (err) {
    console.warn(`⚠️ לא ניתן להוסיף ריאקשן ${REACTION_EMOJI}:`, err.message);
  }

  await rulesDoc.set({
    messageId: sentMessage.id,
    sentAt: new Date().toISOString()
  });

  console.log('✅ Embed חוקים נשלח ונשמר במסד');
}

// 📩 שליחת כפתור אישי למשתמש שעדיין לא אישר
async function sendRulesToUser(member) {
  const ref = db.collection(ACCEPTED_COLLECTION).doc(member.id);
  const snap = await ref.get();

  if (snap.exists) return;

  const row = await buildAcceptButton(member.id);

  try {
    await member.send({
      content: '📘 כדי להשלים את ההצטרפות, אשר שקראת את חוקי הקהילה:',
      components: [row]
    });
  } catch {
    console.warn(`⚠️ לא ניתן לשלוח DM ל־${member.user?.username || member.id}`);
  }
}

// 🖱️ טיפול בלחיצה על כפתור אישור
async function handleRulesInteraction(interaction) {
  if (interaction.customId !== 'accept_rules') return;
  const userId = interaction.user.id;
  const ref = db.collection(ACCEPTED_COLLECTION).doc(userId);
  const snap = await ref.get();

  if (snap.exists) {
    return interaction.reply({
      content: '🔒 כבר אישרת את החוקים בעבר.',
      ephemeral: true
    });
  }

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

  const row = await buildAcceptButton(userId);
  await interaction.update({
    content: '✅ החוקים אושרו!',
    components: [row]
  });
}

// 📆 עדכון שבועי של הבאנר – לפי קרון
function startWeeklyRulesUpdate(client) {
  const cron = require('node-cron');
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await sendPublicRulesEmbed(client);
  });
}

module.exports = {
  sendPublicRulesEmbed,
  sendRulesToUser,
  handleRulesInteraction,
  startWeeklyRulesUpdate
};

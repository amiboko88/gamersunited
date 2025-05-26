const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase');

const RULES_CHANNEL_ID = '1375414950683607103';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const RULES_META_PATH = 'rulesMeta/config';

const rulesPages = [
  { title: '🎮 כללי', lines: ['אין פרסום, אין גזענות, אין טרולים.', 'שמור על כבוד הדדי והומור בגבול הטעם הטוב.'] },
  { title: '💬 צ׳אט', lines: ['שפה מכבדת בלבד.', 'בלי קללות, ספאם, או לינקים מזיקים.', 'זיהוי ספאם מופעל אוטומטית.'] },
  { title: '🎧 חדרי קול', lines: ['לא להשמיע מוזיקה או רעש מטריד.', 'השתמש ב־Push-to-Talk או השתק עצמך כשצריך.'] },
  { title: '🤖 שימוש בבוטים', lines: ['שימוש הוגן בלבד.', 'אל תציף פקודות, TTS מיותר, או תקלות מכוונות.'] },
  { title: '⚠️ ענישה ודיווחים', lines: ['הפרות יתועדו בלוג.', 'שלבים: אזהרה → חסימה זמנית → קיק/באן.', 'דיווחים בערוץ התמיכה בלבד.'] }
];

// 🖼️ קובץ באנר לפי שבוע
function getBannerPath() {
  const assetDir = path.join(__dirname, '../assets');
  const banners = fs.readdirSync(assetDir).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(assetDir, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(assetDir, banners[index]);
}

// 🧱 Embed לדף חוקים לפי index
function buildRulesEmbed(userId) {
  const index = userPages.get(userId) || 0;
  const page = rulesPages[index];
  const desc = page.lines.map(line => `• ${line}`).join('\n\n');
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📘 חוקי הקהילה – ${page.title}`)
    .setDescription(desc)
    .setImage('attachment://banner.png')
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `עמוד ${index + 1} מתוך ${rulesPages.length}`, iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

// ⬅️➡️ כפתורי דפדוף בלבד
function buildPageButtons(userId) {
  const index = userPages.get(userId) || 0;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rules_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder().setCustomId('rules_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(index === rulesPages.length - 1)
  );
}

// 🧠 זיכרון זמני של כל משתמש
const userPages = new Map();

// 📤 יצירת / עדכון Embed
async function setupRulesMessage(client) {
  const rulesMetaRef = db.doc(RULES_META_PATH);
  const metaSnap = await rulesMetaRef.get();
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const embed = buildRulesEmbed('default');
  const row = buildPageButtons('default');

  try {
    if (metaSnap.exists) {
      const msgId = metaSnap.data().messageId;
      const message = await channel.messages.fetch(msgId);
      await message.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      console.log('🔁 הודעת החוקים עודכנה.');
      return;
    }
  } catch (err) {
    console.warn('⚠️ לא ניתן לערוך את הודעת החוקים:', err.message);
  }

  const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
  await rulesMetaRef.set({ messageId: sent.id });
  console.log('✅ הודעת חוקים חדשה נשלחה.');
}

// ⏱️ עדכון שבועי
function startWeeklyRulesUpdate(client) {
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await setupRulesMessage(client);
  });
}

// 🎯 אישור חוקים
async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;

  if (interaction.customId === 'rules_next' || interaction.customId === 'rules_prev') {
    const current = userPages.get(userId) || 0;
    const newPage = interaction.customId === 'rules_next' ? current + 1 : current - 1;
    userPages.set(userId, Math.max(0, Math.min(rulesPages.length - 1, newPage)));

    const embed = buildRulesEmbed(userId);
    const row = buildPageButtons(userId);
    const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
    const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

    await interaction.update({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
    return;
  }

  // בדיקת אישור
  const acceptedRef = db.collection('rulesAccepted').doc(userId);
  const acceptedSnap = await acceptedRef.get();

  if (!acceptedSnap.exists) {
    await interaction.user.send({
      content: '📘 כדי להמשיך להשתמש בקהילה, אשר שקראת את חוקי הקהילה.',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('accept_rules').setLabel('📥 אשר חוקים').setStyle(ButtonStyle.Success)
        )
      ]
    }).catch(() => {});
  }

  if (interaction.customId === 'accept_rules') {
    await acceptedRef.set({
      userId,
      displayName: interaction.member?.displayName || interaction.user.username,
      acceptedAt: new Date().toISOString()
    });
    await interaction.reply({ content: '✅ החוקים אושרו! שמחים שאתה איתנו.', ephemeral: true });
  }
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

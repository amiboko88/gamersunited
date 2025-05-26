// 📁 handlers/rulesEmbed.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const db = require('../utils/firebase');

const RULES_CHANNEL_ID = '1375414950683607103';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const RULES_META_PATH = 'rulesMeta/config';

const rulesPages = [
  {
    title: '🎮 כללי',
    lines: [
      'אין פרסום, אין גזענות, אין טרולים.',
      'שמור על כבוד הדדי והומור בגבול הטעם הטוב.'
    ]
  },
  {
    title: '💬 צ׳אט',
    lines: [
      'שפה מכבדת בלבד.',
      'בלי קללות, ספאם, או שליחת לינקים מזיקים.',
      'זיהוי ספאם מופעל אוטומטית.'
    ]
  },
  {
    title: '🎧 חדרי קול',
    lines: [
      'לא להשמיע מוזיקה או רעש מטריד.',
      'השתמש ב־Push-to-Talk או השתק עצמך כשצריך.'
    ]
  },
  {
    title: '🤖 שימוש בבוטים',
    lines: [
      'השתמשו בפיצ׳רים בחוכמה.',
      'אין להציף פקודות, להפעיל TTS סתם, או לנצל חולשות.'
    ]
  },
  {
    title: '⚠️ ענישה ודיווחים',
    lines: [
      'הפרות יתועדו בלוג.',
      'שלבים: אזהרה → חסימה זמנית → קיק/באן.',
      'דיווחים יבוצעו בערוץ התמיכה בלבד.'
    ]
  }
];

// 🔁 סיבוב בין תמונות banner.png, banner1.png וכו'
function getRotatingBannerPath() {
  const assetDir = path.join(__dirname, '../assets');
  const banners = fs.readdirSync(assetDir).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (banners.length === 0) return path.join(assetDir, 'banner.png');
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return path.join(assetDir, banners[weekIndex % banners.length]);
}

function buildRulesEmbed(pageIndex = 0) {
  const page = rulesPages[pageIndex];
  const description = page.lines.map(line => `**•** ${line}`).join('\n\n');
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📘 חוקי הקהילה – ${page.title}`)
    .setDescription(description)
    .setImage('attachment://banner.png')
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `עמוד ${pageIndex + 1} מתוך ${rulesPages.length}`, iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

function buildPageRow(pageIndex = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rules_first').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
    new ButtonBuilder().setCustomId('rules_prev').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
    new ButtonBuilder().setCustomId('rules_next').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === rulesPages.length - 1),
    new ButtonBuilder().setCustomId('rules_last').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === rulesPages.length - 1)
  );
}

function buildConfirmRow(hasConfirmed = false) {
  return new ActionRowBuilder().addComponents(
    hasConfirmed
      ? new ButtonBuilder().setLabel('✅ כבר אישרת את החוקים').setStyle(ButtonStyle.Success).setCustomId('confirmed').setDisabled(true)
      : new ButtonBuilder().setCustomId('accept_rules').setLabel('📥 קיבלתי את החוקים').setStyle(ButtonStyle.Success)
  );
}

// 📤 שליחת הודעת החוק הראשונית לערוץ
async function setupRulesMessage(client) {
  const rulesMetaRef = db.doc(RULES_META_PATH);
  const metaSnap = await rulesMetaRef.get();
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);

  const bannerFile = new AttachmentBuilder(getRotatingBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');
  const embed = buildRulesEmbed(0);
  const row = buildConfirmRow(false); // רק כפתור אישור

  try {
    if (metaSnap.exists && metaSnap.data().messageId) {
      const msg = await channel.messages.fetch(metaSnap.data().messageId);
      await msg.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      return;
    }
  } catch (err) {
    console.warn('⚠️ לא ניתן לערוך את הודעת החוקים:', err.message);
  }

  const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
  await rulesMetaRef.set({ messageId: sent.id });
}

// 🕒 עדכון שבועי אוטומטי של הבאנר
function startWeeklyRulesUpdate(client) {
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של תמונת החוקים...');
    await setupRulesMessage(client);
  });
}

// 🧠 אינטראקציה אישית לפי כפתורים
async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;
  const acceptedRef = db.collection('rulesAccepted').doc(userId);
  const acceptedSnap = await acceptedRef.get();

  const joinedAt = interaction.member?.joinedAt?.toDate?.() || new Date();
  const acceptedAt = acceptedSnap.exists ? new Date(acceptedSnap.data().acceptedAt) : null;
  const alreadyAccepted = acceptedSnap.exists && acceptedAt && joinedAt <= acceptedAt;

  if (interaction.customId === 'accept_rules') {
    if (alreadyAccepted) {
      return interaction.reply({ content: '❗ כבר אישרת את החוקים. הכל טוב 😎', ephemeral: true });
    }

    await acceptedRef.set({
      userId,
      displayName: interaction.member?.displayName || interaction.user.username,
      acceptedAt: new Date().toISOString(),
      joinedAt: joinedAt.toISOString()
    }, { merge: true });

    await interaction.reply({
      content: '📬 תודה שקראת את החוקים! נשלחה אליך הודעה פרטית.',
      ephemeral: true
    });

    try {
      await interaction.user.send({
        content: `✅ היי ${interaction.user.username}!\nתודה שקראת את חוקי הקהילה שלנו.\nאנחנו שמחים שאתה כאן 🙌\n\nצוות **GAMERS UNITED IL**`
      });
    } catch {
      console.warn(`⚠️ לא ניתן לשלוח DM ל־${interaction.user.tag}`);
    }

    return;
  }

  // דפדוף – רק בתגובה אישית
  if (interaction.customId.startsWith('rules_')) {
    const footerText = interaction.message?.embeds?.[0]?.footer?.text || '';
    const match = footerText.match(/עמוד (\d+)/);
    let pageIndex = match ? parseInt(match[1]) - 1 : 0;

    switch (interaction.customId) {
      case 'rules_first': pageIndex = 0; break;
      case 'rules_prev': pageIndex = Math.max(0, pageIndex - 1); break;
      case 'rules_next': pageIndex = Math.min(rulesPages.length - 1, pageIndex + 1); break;
      case 'rules_last': pageIndex = rulesPages.length - 1; break;
    }

    const embed = buildRulesEmbed(pageIndex);
    const components = [buildPageRow(pageIndex), buildConfirmRow(alreadyAccepted)];

    return interaction.update({ embeds: [embed], components, ephemeral: true });
  }

  // אם מדובר בכפתור חדש "ראה את החוקים"
  if (interaction.commandName === 'חוקים') {
    const embed = buildRulesEmbed(0);
    const row1 = buildPageRow(0);
    const row2 = buildConfirmRow(alreadyAccepted);
    return interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      ephemeral: true
    });
  }
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

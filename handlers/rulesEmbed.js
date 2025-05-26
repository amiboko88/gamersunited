const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../utils/firebase');
const path = require('path');
const fs = require('fs');

const RULES_CHANNEL_ID = '1375414950683607103';
const RULES_META_PATH = 'rulesMeta/config';
const ACCEPTED_COLLECTION = 'rulesAccepted';
const LOGO_URL = 'attachment://logo.png';
const BANNER_URL = 'attachment://banner.png';

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
      'בלי קללות, ספאם, או לינקים מזיקים.',
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
      'שימוש הוגן בלבד.',
      'אל תציף פקודות, TTS מיותר, או תקלות מכוונות.'
    ]
  },
  {
    title: '⚠️ ענישה ודיווחים',
    lines: [
      'הפרות יתועדו בלוג.',
      'שלבים: אזהרה → חסימה זמנית → קיק/באן.',
      'דיווחים בערוץ התמיכה בלבד.'
    ]
  }
];

// זיכרון פר משתמש של עמוד נוכחי
const userPageMap = new Map();

function getBannerPath() {
  const dir = path.join(__dirname, '../assets');
  const banners = fs.readdirSync(dir).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(dir, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(dir, banners[index]);
}

function buildRulesEmbed(userId) {
  const index = userPageMap.get(userId) || 0;
  const page = rulesPages[index];
  const description = page.lines.map(line => `• ${line}`).join('\n\n') + `\n\n⚠️ הדפדוף הוא אישי לכל משתמש.`;
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`חוקי הקהילה\n\n${page.title}`)
    .setDescription(description)
    .setThumbnail(LOGO_URL)
    .setImage(BANNER_URL)
    .setFooter({ text: `עמוד ${index + 1} מתוך ${rulesPages.length}` })
    .setTimestamp();
}

function buildNavButtons(userId) {
  const index = userPageMap.get(userId) || 0;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rules_prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId('rules_next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === rulesPages.length - 1)
  );
}

async function buildAcceptButton(userId) {
  const snap = await db.collection(ACCEPTED_COLLECTION).doc(userId).get();
  const alreadyAccepted = snap.exists;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setLabel(alreadyAccepted ? '🔒 אושר' : '✅ אשר חוקים')
      .setStyle(alreadyAccepted ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(alreadyAccepted)
  );
}

async function setupRulesMessage(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(path.join(__dirname, '../assets/logo.png')).setName('logo.png');

  const embed = buildRulesEmbed('default');
  const row1 = buildNavButtons('default');
  const row2 = await buildAcceptButton('default');

  const metaRef = db.doc(RULES_META_PATH);
  const metaSnap = await metaRef.get();

  try {
    if (metaSnap.exists) {
      const msg = await channel.messages.fetch(metaSnap.data().messageId);
      await msg.edit({ embeds: [embed], components: [row1, row2], files: [bannerFile, logoFile] });
      return;
    }
  } catch (e) {
    console.warn('⚠️ לא ניתן לערוך את ההודעה הקיימת. שולח חדשה.');
  }

  const sent = await channel.send({ embeds: [embed], components: [row1, row2], files: [bannerFile, logoFile] });
  await metaRef.set({ messageId: sent.id });
}

async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;

  if (customId === 'rules_prev' || customId === 'rules_next') {
    const current = userPageMap.get(userId) || 0;
    const newIndex = customId === 'rules_next' ? current + 1 : current - 1;
    userPageMap.set(userId, Math.max(0, Math.min(rulesPages.length - 1, newIndex)));

    const embed = buildRulesEmbed(userId);
    const row1 = buildNavButtons(userId);
    const row2 = await buildAcceptButton(userId);

    await interaction.deferUpdate();
    await interaction.message.edit({ embeds: [embed], components: [row1, row2] });
    return;
  }

  if (customId === 'accept_rules') {
    const ref = db.collection(ACCEPTED_COLLECTION).doc(userId);
    const snap = await ref.get();
    if (snap.exists) {
      return interaction.reply({ content: '🔒 כבר אישרת את החוקים בעבר.', ephemeral: true });
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

    const embed = buildRulesEmbed(userId);
    const row1 = buildNavButtons(userId);
    const row2 = await buildAcceptButton(userId);

    await interaction.deferUpdate();
    await interaction.message.edit({ embeds: [embed], components: [row1, row2] });
  }
}

module.exports = {
  setupRulesMessage,
  handleRulesInteraction
};

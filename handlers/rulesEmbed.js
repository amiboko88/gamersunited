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
const RULES_META_PATH = 'rulesMeta/config';
const ACCEPTED_COLLECTION = 'rulesAccepted';

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

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

function getRulesEmbed(index = 0) {
  const page = rulesPages[index];
  const description = page.lines.map(line => `• ${line}`).join('\n\n') + `\n\n🔒 **הכפתור בתחתית ההודעה פועל רק עבורך.**`;

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`חוקי הקהילה\n\n${page.title}`)
    .setDescription(description)
    .setImage('attachment://banner.png')
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `עמוד ${index + 1} מתוך ${rulesPages.length}`, iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

function getPageButtons(index = 0) {
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

async function getAcceptButton(userId) {
  const acceptedRef = db.collection(ACCEPTED_COLLECTION).doc(userId);
  const acceptedSnap = await acceptedRef.get();

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setStyle(acceptedSnap.exists ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setLabel(acceptedSnap.exists ? '🔒 אושר' : '✅ אשר חוקים')
      .setDisabled(acceptedSnap.exists)
  );
}

function getBannerPath() {
  const assetDir = path.join(__dirname, '../assets');
  const banners = fs.readdirSync(assetDir).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(assetDir, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(assetDir, banners[index]);
}

async function setupRulesMessage(client) {
  const rulesMetaRef = db.doc(RULES_META_PATH);
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const embed = getRulesEmbed(0);
  const nav = getPageButtons(0);
  const btn = await getAcceptButton('default');

  try {
    const metaSnap = await rulesMetaRef.get();
    if (metaSnap.exists) {
      const msgId = metaSnap.data().messageId;
      const message = await channel.messages.fetch(msgId);
      await message.edit({ embeds: [embed], components: [nav, btn], files: [bannerFile, logoFile] });
      console.log('🔁 הודעת החוקים עודכנה.');
      return;
    }
  } catch (err) {
    console.warn('⚠️ לא ניתן לערוך את הודעת החוקים:', err.message);
  }

  const sent = await channel.send({ embeds: [embed], components: [nav, btn], files: [bannerFile, logoFile] });
  await rulesMetaRef.set({ messageId: sent.id });
  console.log('✅ הודעת חוקים חדשה נשלחה.');
}

async function handleRulesInteraction(interaction) {
  const { customId, user } = interaction;
  const userId = user.id;

  if (!interaction.member || !interaction.channel) return;

  const session = interaction.client.rulesSession || new Map();
  interaction.client.rulesSession = session;
  const currentIndex = session.get(userId) ?? 0;

  if (customId === 'rules_next' || customId === 'rules_prev') {
    const newIndex = Math.max(0, Math.min(rulesPages.length - 1,
      customId === 'rules_next' ? currentIndex + 1 : currentIndex - 1
    ));

    session.set(userId, newIndex);

    const embed = getRulesEmbed(newIndex);
    const nav = getPageButtons(newIndex);
    const btn = await getAcceptButton(userId);
    const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
    const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components: [nav, btn], files: [bannerFile, logoFile] });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [nav, btn],
        files: [bannerFile, logoFile],
        ephemeral: true
      });
    }
    return;
  }

  if (customId === 'accept_rules') {
    const acceptedRef = db.collection(ACCEPTED_COLLECTION).doc(userId);
    const acceptedSnap = await acceptedRef.get();

    if (acceptedSnap.exists) {
      return interaction.reply({
        content: '🔒 כבר אישרת את החוקים בעבר.',
        ephemeral: true
      });
    }

    await acceptedRef.set({
      userId,
      username: user.username,
      displayName: interaction.member?.displayName || user.username,
      acceptedAt: new Date().toISOString()
    });

    try {
      await user.send('📘 תודה שאישרת את חוקי הקהילה!');
    } catch {
      console.warn(`⚠️ לא ניתן לשלוח DM ל־${user.username}`);
    }

    const embed = getRulesEmbed(currentIndex);
    const nav = getPageButtons(currentIndex);
    const btn = await getAcceptButton(userId);
    const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
    const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

    await interaction.reply({
      content: '✅ החוקים אושרו! שמחים שאתה איתנו.',
      embeds: [embed],
      components: [nav, btn],
      files: [bannerFile, logoFile],
      ephemeral: true
    });
  }
}

function startWeeklyRulesUpdate(client) {
  const cron = require('node-cron');
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await setupRulesMessage(client);
  });
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

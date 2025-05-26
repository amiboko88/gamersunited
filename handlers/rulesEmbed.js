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

function getRotatingBannerPath() {
  const assetDir = path.join(__dirname, '../assets');
  const banners = fs.readdirSync(assetDir).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (banners.length === 0) return path.join(assetDir, 'banner.png');

  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const chosen = banners[weekIndex % banners.length];
  return path.join(assetDir, chosen);
}

function buildBannerFile() {
  const bannerPath = getRotatingBannerPath();
  return new AttachmentBuilder(bannerPath).setName('banner.png');
}

function buildRulesEmbed(pageIndex = 0) {
  const page = rulesPages[pageIndex];
  const formatted = page.lines.map(line => `‏\n**•** ${line}\n`).join('');
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📘 חוקי הקהילה – ${page.title}`)
    .setDescription(formatted)
    .setImage('attachment://banner.png')
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `עמוד ${pageIndex + 1} מתוך ${rulesPages.length}`, iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

function buildActionRow(pageIndex = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rules_first').setLabel('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
    new ButtonBuilder().setCustomId('rules_prev').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
    new ButtonBuilder().setCustomId('rules_next').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === rulesPages.length - 1),
    new ButtonBuilder().setCustomId('rules_last').setLabel('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === rulesPages.length - 1),
    new ButtonBuilder().setCustomId('accept_rules').setLabel('📥 קיבלתי את החוקים').setStyle(ButtonStyle.Success)
  );
}

async function setupRulesMessage(client) {
  const rulesMetaRef = db.doc(RULES_META_PATH);
  const metaSnap = await rulesMetaRef.get();
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const bannerFile = buildBannerFile();
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const embed = buildRulesEmbed(0);
  const row = buildActionRow(0);

  let message;
  const msgId = metaSnap.exists ? metaSnap.data().messageId : null;

  if (msgId) {
    try {
      message = await channel.messages.fetch(msgId);
      await message.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      console.log('🔁 הודעת החוקים עודכנה.');
      return;
    } catch (err) {
      console.warn('⚠️ לא ניתן לערוך את הודעת החוקים:', err.message);
    }
  }

  const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
  await rulesMetaRef.set({ messageId: sent.id, lastImageUpdate: new Date().toISOString() });
  console.log('✅ הודעת חוקים חדשה נשלחה.');
}

function startWeeklyRulesUpdate(client) {
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של תמונת החוקים...');
    await setupRulesMessage(client);
  });
}

async function handleRulesInteraction(interaction) {
  try {
    const rulesMetaRef = db.doc(RULES_META_PATH);
    const metaSnap = await rulesMetaRef.get();
    const bannerFile = buildBannerFile();
    const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

    if (interaction.customId === 'accept_rules') {
      await interaction.reply({ content: '📬 תודה שקראת את החוקים! נשלחה אליך הודעה פרטית.', ephemeral: true });
      try {
        await interaction.user.send({
          content: `✅ היי ${interaction.user.username}!\nתודה שקראת את חוקי הקהילה שלנו.\nאנחנו שמחים שאתה כאן 🙌\n\nצוות **GAMERS UNITED IL**`
        });
      } catch {
        console.warn(`⚠️ לא ניתן לשלוח DM ל־${interaction.user.tag}`);
      }
      return;
    }

    const msgId = metaSnap.data().messageId;
    if (!msgId) return;

    const message = await interaction.channel.messages.fetch(msgId);
    const currentEmbed = message.embeds[0];
    const footerText = currentEmbed.footer?.text || '';
    const match = footerText.match(/עמוד (\d+)/);
    let pageIndex = match ? parseInt(match[1]) - 1 : 0;

    switch (interaction.customId) {
      case 'rules_first': pageIndex = 0; break;
      case 'rules_prev': pageIndex = Math.max(0, pageIndex - 1); break;
      case 'rules_next': pageIndex = Math.min(rulesPages.length - 1, pageIndex + 1); break;
      case 'rules_last': pageIndex = rulesPages.length - 1; break;
    }

    await interaction.deferUpdate();
    const newEmbed = buildRulesEmbed(pageIndex);
    const newRow = buildActionRow(pageIndex);

    await message.edit({ embeds: [newEmbed], components: [newRow], files: [bannerFile, logoFile] });
  } catch (err) {
    console.error('❌ שגיאה בטיפול בכפתור חוקים:', err);
  }
}

module.exports = {
  RULES_CHANNEL_ID,
  LOGO_PATH,
  RULES_META_PATH,
  buildRulesEmbed,
  buildBannerFile,
  buildActionRow,
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

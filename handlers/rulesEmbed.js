// 📁 handlers/rulesEmbed.js
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const cron = require('node-cron');
const path = require('path');
const db = require('../utils/firebase');
const { generateRulesImage } = require('../utils/generateRulesImage');

const RULES_CHANNEL_ID = '1375414950683607103';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const BANNER_PATH = path.join(__dirname, '../assets/banner.png');
const RULES_META_PATH = 'rulesMeta/config';

const rulesPages = [
  {
    title: '🎮 כללי',
    description: 'אין פרסום, אין גזענות, אין טרולים. שמור על כבוד הדדי והומור בגבול הטעם הטוב.'
  },
  {
    title: '💬 צ׳אט',
    description: 'שפה מכבדת בלבד. בלי קללות, ספאם, או שליחת לינקים מזיקים. זיהוי ספאם מנוטר.'
  },
  {
    title: '🎧 חדרי קול',
    description: 'נא לא להשמיע מוזיקה או רעש מטריד. הימנע מהפרעות. השתמש ב־Push-to-Talk אם צריך.'
  },
  {
    title: '🤖 בוטים ופיצ׳רים',
    description: 'שימוש הוגן בלבד. אין להציף פקודות, להפעיל TTS ללא צורך, או לנצל חולשות במערכת.'
  },
  {
    title: '⚠️ ענישה ודיווחים',
    description: 'כל הפרה תתועד. אזהרות → חסימה זמנית → קיק/באן. דיווחים בערוץ התמיכה בלבד.'
  }
];

function buildRulesEmbed(pageIndex = 0) {
  const page = rulesPages[pageIndex];
  return new EmbedBuilder()
    .setColor('#00AEEF')
    .setTitle(`📘 חוקי הקהילה – ${page.title}`)
    .setDescription(page.description)
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
  await generateRulesImage();

  const rulesMetaRef = db.doc(RULES_META_PATH);
  const metaSnap = await rulesMetaRef.get();
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const bannerFile = new AttachmentBuilder(BANNER_PATH).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  const embed = buildRulesEmbed(0);
  const row = buildActionRow(0);

  if (!metaSnap.exists || !metaSnap.data().messageId) {
    const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
    await rulesMetaRef.set({ messageId: sent.id, lastImageUpdate: new Date().toISOString() });
    console.log('✅ הודעת חוקים נשלחה לראשונה.');
  } else {
    const msgId = metaSnap.data().messageId;
    try {
      const message = await channel.messages.fetch(msgId);
      await message.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      console.log('🔁 הודעת החוקים עודכנה (עמוד 1 + תמונה).');
    } catch (err) {
      console.warn('⚠️ לא ניתן לערוך את הודעת החוקים:', err.message);
    }
  }
}

function startWeeklyRulesUpdate(client) {
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של תמונת החוקים...');
    await setupRulesMessage(client);
  });
}

async function handleRulesInteraction(interaction) {
  const rulesMetaRef = db.doc(RULES_META_PATH);
  const metaSnap = await rulesMetaRef.get();
  const bannerFile = new AttachmentBuilder(BANNER_PATH).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');

  if (interaction.customId === 'accept_rules') {
    await interaction.reply({ content: '📬 תודה שקראת את החוקים! נשלחה אליך הודעה פרטית.', ephemeral: true });
    try {
      await interaction.user.send({
        content: `✅ היי ${interaction.user.username}!
תודה שקראת את חוקי הקהילה שלנו.
אנחנו שמחים שאתה כאן 🙌\n\nצוות **GAMERS UNITED IL**`
      });
    } catch {
      console.warn(`⚠️ לא ניתן לשלוח DM ל־${interaction.user.tag}`);
    }
    return;
  }

  const message = await interaction.channel.messages.fetch(metaSnap.data().messageId);
  if (!message) return;

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

  const newEmbed = buildRulesEmbed(pageIndex);
  const newRow = buildActionRow(pageIndex);

  await interaction.update({ embeds: [newEmbed], components: [newRow], files: [bannerFile, logoFile] });
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

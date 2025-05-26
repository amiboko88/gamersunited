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

// מזהים
const RULES_CHANNEL_ID = '1375414950683607103';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const BANNERS_DIR = path.join(__dirname, '../assets');
const RULES_META_PATH = 'rulesMeta/config';
const ACCEPTED_COLLECTION = 'rulesAccepted';

// 🖼️ שליפת באנר שבועי
function getBannerPath() {
  const banners = fs.readdirSync(BANNERS_DIR).filter(f => f.startsWith('banner') && f.endsWith('.png'));
  if (!banners.length) return path.join(BANNERS_DIR, 'banner.png');
  const index = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % banners.length;
  return path.join(BANNERS_DIR, banners[index]);
}

// 📘 יצירת Embed עם חוקי הקהילה
function buildRulesEmbed() {
  const description = `

 חוקי הקהילת 

━━━━━━━━━━━━━━━━━━━━━━━━━━

כללי 🎮  
אין פרסום, אין גזענות, אין טרולים  
שמור על כבוד הדדי והומור בגבול הטעם הטוב  

צ׳אט 💬  
שפה מכבדת בלבד  
בלי קללות, ספאם או קישורים מזיקים  
זיהוי ספאם פועל אוטומטית  

חדרי קול 🎧  
אין להשמיע מוזיקה או רעש מטריד  

שימוש בבוטים 🤖  
שימוש הוגן בלבד  
אין להציף פקודות או לנצל תכונות לרעה  
TTS – לשימוש חיובי ומצחיק בלבד  

ענישה ודיווחים ⚠️  
כל הפרה תתועד בלוג הפנימי  
שלבי ענישה: אזהרה → חסימה זמנית → קיק / באן  
ניתן לדווח בערוץ התמיכה בלבד  

━━━━━━━━━━━━━━━━━━━━━━━━━━

בלחיצה על הכפתור למטה אתה מאשר שקראת והסכמת לכללי הקהילה ✅
`;

  return new EmbedBuilder()
    .setColor('#2f3136')
    .setTitle('GAMERS UNITED IL')
    .setDescription(description)
    .setImage('attachment://banner.png')
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'עודכן אוטומטית', iconURL: 'attachment://logo.png' })
    .setTimestamp();
}

// 🎯 יצירת כפתור אימות אישי
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

// 📤 יצירת / עדכון הודעת חוקי הקהילה
async function setupRulesMessage(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID);
  const embed = buildRulesEmbed();
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');
  const row = await buildAcceptButton('default');

  const metaRef = db.doc(RULES_META_PATH);
  const metaSnap = await metaRef.get();

  try {
    if (metaSnap.exists) {
      const msgId = metaSnap.data().messageId;
      const message = await channel.messages.fetch(msgId);
      await message.edit({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
      return;
    }
  } catch (err) {
    console.warn('⚠️ ההודעה לא קיימת או לא ניתנת לעריכה. שולח חדשה.');
  }

  const sent = await channel.send({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
  await metaRef.set({ messageId: sent.id });
}

// 🔁 עדכון שבועי של הבאנר
function startWeeklyRulesUpdate(client) {
  const cron = require('node-cron');
  cron.schedule('0 5 * * 0', async () => {
    console.log('📆 עדכון שבועי של הבאנר...');
    await setupRulesMessage(client);
  });
}

// 🧠 תגובת כפתור אישור חוקים
async function handleRulesInteraction(interaction) {
  const userId = interaction.user.id;

  if (interaction.customId !== 'accept_rules') return;

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

  const embed = buildRulesEmbed();
  const bannerFile = new AttachmentBuilder(getBannerPath()).setName('banner.png');
  const logoFile = new AttachmentBuilder(LOGO_PATH).setName('logo.png');
  const row = await buildAcceptButton(userId);

  await interaction.update({ embeds: [embed], components: [row], files: [bannerFile, logoFile] });
}

module.exports = {
  setupRulesMessage,
  startWeeklyRulesUpdate,
  handleRulesInteraction
};

// 📁 handlers/scheduleUpdater.js
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase');

const CHANNEL_ID = '1375415546769838120'; // ערוץ הלוח
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const FONT_PATH = path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf');
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png'); // עדכן אם השם שונה

// פעילויות מגוונות, לא חוזר על עצמו בשבוע
const ACTIVITY_BANK = [
  '🕹️ טורניר פיפו סודי — מתכוננים לקרב חיי הלילה',
  '💥 ערב Resurgence עם הקבועים. צחוקים, קרינג׳, וצרחות',
  '🔫 GUN GAME לכל הרעבים לדם (ואל תשכחו אוזניות)',
  '🎲 ערב חידות ומשימות משוגעות עם פרסים בסוף',
  '🛡️ קלאן-וור נדיר! כולם באים, לא מעניין אותנו תירוצים',
  '🎯 סקוודים מתפזרים — מי ישרוד עד הסוף?',
  '🔥 מוצ"ש של אש! סשן לילה עד שהאצבעות נמסות',
  '👾 ערב משחקים נוסטלגיים + בדיחות אבא של רועי',
  '🏆 אליפות קולות הזויים במיקרופון, כולל פרס למעפן השבוע',
  '⚔️ טורניר 1v1 קטלני. בלי רחמים, בלי בכי',
  '🥳 ערב חפירות/סיכומים — דופקים צחוקים על כל הלוזרים'
];

const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שבת'];

// הפקת פעילות אקראית לכל יום
function getRandomActivities() {
  const used = new Set();
  while (used.size < WEEK_DAYS.length) {
    const idx = Math.floor(Math.random() * ACTIVITY_BANK.length);
    used.add(idx);
  }
  return Array.from(used).map(i => ACTIVITY_BANK[i]);
}

// ציור טבלה עברית רחבה ומגניבה
function drawTableHebrew(ctx, activities) {
  ctx.fillStyle = '#222c3a';
  ctx.fillRect(0, 0, 1080, 720);

  ctx.font = 'bold 60px Noto';
  ctx.fillStyle = '#00B2FF';
  ctx.textAlign = 'center';
  ctx.fillText('לוח פעילות שבועי', 540, 80);

  // כותרות ימים
  ctx.font = 'bold 40px Noto';
  ctx.textAlign = 'center';
  WEEK_DAYS.forEach((day, i) => {
    ctx.fillStyle = '#FFD700';
    ctx.fillText(day, 180 + i * 150, 170);
  });

  // פעילויות
  activities.forEach((activity, i) => {
    ctx.fillStyle = '#FFF';
    ctx.font = '32px Noto';
    ctx.textAlign = 'center';
    ctx.fillText(activity, 180 + i * 150, 250, 140);
  });
}

// הפונקציה הראשית — שליחה/עדכון Cover והלוח השבועי
async function postOrUpdateWeeklySchedule(client, manual = false) {
  const today = new Date();
  const scheduleDoc = db.doc('schedule/message');
  const systemRef = db.collection('systemTasks').doc('weeklyScheduler');
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  // שליחת תמונת כותרת — רק אם אין כבר
  const coverDoc = db.collection('systemTasks').doc('coverImage');
  const coverSnap = await coverDoc.get();
  if (!coverSnap.exists) {
    try {
      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'cover.png' });
      const coverMsg = await channel.send({ files: [coverAttachment] });
      await coverDoc.set({ id: coverMsg.id });
      console.log('🎨 נשלחה תמונת כותרת לערוץ!');
      // המתן שנייה למניעת כפילות/בלבול בעומס (דיסקורד איטי לפעמים)
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error('❌ כשל בשליחת תמונת כותרת:', e);
    }
  }

  // יצירת פעילות רנדומלית לשבוע
  const activities = getRandomActivities();

  // בניית התמונה (canvas)
  registerFont(FONT_PATH, { family: 'Noto' });
  const canvas = createCanvas(1080, 720);
  const ctx = canvas.getContext('2d');
  drawTableHebrew(ctx, activities);

  // הוספת לוגו בפינה
  try {
    const logo = await loadImage(LOGO_PATH);
    ctx.drawImage(logo, 900, 600, 140, 100);
  } catch (e) {
    console.warn('⚠️ לוגו לא נטען:', e);
  }

  const buffer = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: 'activityBoard.png' });

  // בניית Embed (הלוח)
  const embed = new EmbedBuilder()
    .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
    .setDescription('בחר באילו ימים אתה זורם עם הלוז. כל שבוע: פעילות רנדומלית, אווירה, וכפתורי הצבעה לכל יום! 🎮')
    .setImage('attachment://activityBoard.png')
    .setColor('#00B2FF')
    .setFooter({ text: 'נוצר אוטומטית ע״י שמעון הבוט | שבת שלום' })
    .setTimestamp();

  // כפתורים (לכל יום)
  const buttons = new ActionRowBuilder().addComponents(
    ...WEEK_DAYS.map((day, index) =>
      new ButtonBuilder()
        .setCustomId(`rsvp_${index}`)
        .setLabel(day)
        .setStyle(ButtonStyle.Primary)
    )
  );

  // איפוס הצבעות שבועיות
  await db.collection('rsvp').get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });

  // עדכון/שליחת ההודעה (Embed הלוח)
  const docSnap = await scheduleDoc.get();
  if (docSnap.exists) {
    try {
      const msg = await channel.messages.fetch(docSnap.data().id);
      await msg.edit({ embeds: [embed], files: [attachment], components: [buttons] });
      await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
      if (manual) return '🔁 לוח שבועי עודכן ידנית!';
      console.log('🔁 לוח שבועי עודכן');
      return;
    } catch (e) {
      console.warn('⚠️ ההודעה הישנה לא נמצאה. שולח חדשה...');
    }
  }

  // שליחה חדשה (אם אין)
  const sentMsg = await channel.send({ embeds: [embed], files: [attachment], components: [buttons] });
  await scheduleDoc.set({ id: sentMsg.id });
  await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
  if (manual) return '📤 נשלח לוח חדש ידנית!';
  console.log('📤 נשלח לוח שבועי חדש');
}

module.exports = { postOrUpdateWeeklySchedule };

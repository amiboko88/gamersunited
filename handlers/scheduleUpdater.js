// 📁 handlers/scheduleUpdater.js
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase');

const CHANNEL_ID = '1375415546769838120'; // ערוץ הלוח
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const FONT_PATH = path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf');

// רשימת פעילויות — כל שבוע רנדומלי (החלף/הוסף כרצונך)
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

// ימי השבוע בלוח (בלי שישי!)
const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שבת'];

function getRandomActivities() {
  const used = [];
  while (used.length < WEEK_DAYS.length) {
    const idx = Math.floor(Math.random() * ACTIVITY_BANK.length);
    if (!used.includes(idx)) used.push(idx);
  }
  return used.map(i => ACTIVITY_BANK[i]);
}

function drawTableHebrew(ctx, activities) {
  ctx.fillStyle = '#222c3a';
  ctx.fillRect(0, 0, 1080, 720);

  ctx.font = 'bold 60px Noto';
  ctx.fillStyle = '#00B2FF';
  ctx.textAlign = 'center';
  ctx.fillText('לוח פעילות שבועי', 540, 80);

  // טבלה
  ctx.font = 'bold 40px Noto';
  ctx.textAlign = 'center';

  // כותרות ימים
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

async function postOrUpdateWeeklySchedule(client, manual = false) {
  const today = new Date();
  const scheduleDoc = db.doc('schedule/message');
  const systemRef = db.collection('systemTasks').doc('weeklyScheduler');
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  // אקראי מחדש כל שבוע
  const activities = getRandomActivities();

  registerFont(FONT_PATH, { family: 'Noto' });
  const canvas = createCanvas(1080, 720);
  const ctx = canvas.getContext('2d');
  drawTableHebrew(ctx, activities);

  // לוגו פינה
  try {
    const logo = await loadImage(LOGO_PATH);
    ctx.drawImage(logo, 900, 600, 140, 100);
  } catch (e) {
    console.warn('לוגו לא נטען:', e);
  }

  const buffer = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: 'activityBoard.png' });

  const embed = new EmbedBuilder()
    .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
    .setDescription('בחר באילו ימים אתה זורם עם הלוז. כל שבוע: פעילות רנדומלית, אווירה, וכפתורי הצבעה לכל יום! 🎮')
    .setImage('attachment://activityBoard.png')
    .setColor('#00B2FF')
    .setFooter({ text: 'נוצר אוטומטית ע״י שמעון הבוט | שבת שלום' })
    .setTimestamp();

  // כפתורים (בלי שישי)
  const buttons = new ActionRowBuilder().addComponents(
    ...WEEK_DAYS.map((day, index) =>
      new ButtonBuilder()
        .setCustomId(`rsvp_${index}`)
        .setLabel(day)
        .setStyle(ButtonStyle.Primary)
    )
  );

  // שמירת הרשאות (reset)
  await db.collection('rsvp').get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });

  // אם קיימת הודעה – ערוך אותה
  const docSnap = await scheduleDoc.get();
  if (docSnap.exists) {
    try {
      const msg = await channel.messages.fetch(docSnap.data().id);
      await msg.edit({ embeds: [embed], files: [attachment], components: [buttons] });
      await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
      if (manual) return 'עודכן לוח ידנית!';
      console.log('🔁 לוח שבועי עודכן');
      return;
    } catch (e) {
      console.warn('⚠️ ההודעה הישנה לא נמצאה. שולח חדשה...');
    }
  }

  // שלח חדש
  const sentMsg = await channel.send({ embeds: [embed], files: [attachment], components: [buttons] });
  await scheduleDoc.set({ id: sentMsg.id });
  await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
  if (manual) return 'נשלח לוח חדש ידנית!';
  console.log('📤 נשלח לוח שבועי חדש');
}

module.exports = { postOrUpdateWeeklySchedule };

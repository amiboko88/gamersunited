// 📁 handlers/scheduleUpdater.js
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase');

const CHANNEL_ID = '1375415546769838120';
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const FONT_PATH = path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf');
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png');

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

function getRandomActivities() {
  const used = new Set();
  while (used.size < WEEK_DAYS.length) {
    const idx = Math.floor(Math.random() * ACTIVITY_BANK.length);
    used.add(idx);
  }
  return Array.from(used).map(i => ACTIVITY_BANK[i]);
}

function drawTableHebrew(ctx, activities, logo) {
  ctx.fillStyle = '#142036'; // רקע כהה
  ctx.fillRect(0, 0, 1080, 800);

  // כותרת
  ctx.font = 'bold 68px Noto';
  ctx.fillStyle = '#00B2FF';
  ctx.textAlign = 'center';
  ctx.fillText('לוח פעילות שבועי', 540, 100);

  // טבלה — כל יום בשורה
  const tableTop = 180;
  const rowHeight = 90;
  const colDayX = 940;
  const colActX = 180;

  for (let i = 0; i < WEEK_DAYS.length; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,178,255,0.10)' : 'rgba(30,45,60,0.92)';
    ctx.fillRect(70, tableTop + i*rowHeight - 55, 940, rowHeight);

    // יום (ימין)
    ctx.font = 'bold 44px Noto';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.strokeStyle = '#222c3a';
    ctx.lineWidth = 6;
    ctx.strokeText(WEEK_DAYS[i], colDayX, tableTop + i*rowHeight);
    ctx.fillText(WEEK_DAYS[i], colDayX, tableTop + i*rowHeight);

    // פעילות (שמאל)
    ctx.font = '32px Noto';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#00B2FF';
    ctx.lineWidth = 3;
    ctx.strokeText(activities[i], colActX, tableTop + i*rowHeight);
    ctx.fillText(activities[i], colActX, tableTop + i*rowHeight);
  }

  // סמל בצד שמאל למטה
  ctx.drawImage(logo, 80, 670, 110, 85);
  // שם הקבוצה ליד הסמל
  ctx.font = 'bold 40px Noto';
  ctx.fillStyle = '#00B2FF';
  ctx.textAlign = 'left';
  ctx.fillText('GAMERS UNITED IL', 210, 780);
}

async function postOrUpdateWeeklySchedule(client, manual = false) {
  const today = new Date();
  const scheduleDoc = db.doc('schedule/message');
  const systemRef = db.collection('systemTasks').doc('weeklyScheduler');
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  // שליחת תמונת כותרת (אם אין)
  const coverDoc = db.collection('systemTasks').doc('coverImage');
  const coverSnap = await coverDoc.get();
  if (!coverSnap.exists) {
    try {
      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'cover.png' });
      const coverMsg = await channel.send({ files: [coverAttachment] });
      await coverDoc.set({ id: coverMsg.id });
      console.log('🎨 נשלחה תמונת כותרת לערוץ!');
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error('❌ כשל בשליחת תמונת כותרת:', e);
    }
  }

  const activities = getRandomActivities();

  registerFont(FONT_PATH, { family: 'Noto' });
  const canvas = createCanvas(1080, 800);
  const ctx = canvas.getContext('2d');
  const logo = await loadImage(LOGO_PATH);
  drawTableHebrew(ctx, activities, logo);

  const buffer = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: 'activityBoard.png' });

  const embed = new EmbedBuilder()
    .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
    .setDescription('בחר באילו ימים אתה זורם עם הלוז. כל שבוע: פעילות רנדומלית, אווירה, וכפתורי הצבעה לכל יום! 🎮')
    .setImage('attachment://activityBoard.png')
    .setColor('#00B2FF')
    .setFooter({ text: 'נוצר אוטומטית ע״י שמעון הבוט | שבת שלום' })
    .setTimestamp();

  // פיצול כפתורים (5 + 1)
  const buttonsArr = WEEK_DAYS.map((day, index) =>
    new ButtonBuilder()
      .setCustomId(`rsvp_${index}`)
      .setLabel(day)
      .setStyle(ButtonStyle.Primary)
  );
  const buttonRows = [];
  buttonRows.push(new ActionRowBuilder().addComponents(...buttonsArr.slice(0, 5)));
  if (buttonsArr.length > 5) {
    buttonRows.push(new ActionRowBuilder().addComponents(...buttonsArr.slice(5)));
  }

  // איפוס הצבעות שבועיות
  await db.collection('rsvp').get().then(snapshot => {
    snapshot.forEach(doc => doc.ref.delete());
  });

  // עדכון/שליחת ההודעה
  const docSnap = await scheduleDoc.get();
  if (docSnap.exists) {
    try {
      const msg = await channel.messages.fetch(docSnap.data().id);
      await msg.edit({ embeds: [embed], files: [attachment], components: buttonRows });
      await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
      if (manual) return '🔁 לוח שבועי עודכן ידנית!';
      console.log('🔁 לוח שבועי עודכן');
      return;
    } catch (e) {
      console.warn('⚠️ ההודעה הישנה לא נמצאה. שולח חדשה...');
    }
  }

  // שליחה חדשה (אם אין)
  const sentMsg = await channel.send({ embeds: [embed], files: [attachment], components: buttonRows });
  await scheduleDoc.set({ id: sentMsg.id });
  await systemRef.set({ lastScheduleSent: today.toISOString().split('T')[0] }, { merge: true });
  if (manual) return '📤 נשלח לוח חדש ידנית!';
  console.log('📤 נשלח לוח שבועי חדש');
}

module.exports = { postOrUpdateWeeklySchedule };

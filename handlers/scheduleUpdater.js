// 📁 handlers/scheduleUpdater.js
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const db = require('../utils/firebase'); // ✅ תיקון כאן
const { generateDalleImage } = require('../utils/dalleImage');

const CHANNEL_ID = '1375415546769838120'; // ערוץ הלוח
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const FONT_PATH = path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf');

const SCHEDULE = [
  ['ראשון', '😪 פתיחת שבוע עם שביזות. אם מישהו עולה – זה נס רפואי.'],
  ['שני', '🔫 GUN GAME, מולטי קליל, וחימום קל לקראת ימי האמת.'],
  ['שלישי', '💥 ערב Resurgence עם הקבועים. נכנסים – נופלים – צועקים – חוזרים.'],
  ['רביעי', '🎯 קבוצות מתפרקות, חברויות נבחנות. סיבובי COD לכל דורש.'],
  ['חמישי', '🛡️ ערב קרב רציני. פיפו סקוודים עם מי שנשאר בחיים מהשבוע.'],
  ['שישי', '📿 יום מנוחה. תשמרו שבת. וגם אם לא – תעשו הפסקה, אתם נשמעים גמורים.'],
  ['שבת', '🔥 מוצ"ש = זמן פיפו. כולם מתייצבים בלי תירוצים ובלי מיותרים.']
];

async function postOrUpdateWeeklySchedule(client) {
  const today = new Date().toISOString().split('T')[0];
  const systemRef = db.collection('systemTasks').doc('weekly');
  const systemSnap = await systemRef.get();
  if (systemSnap.exists && systemSnap.data().lastScheduleSent === today) {
    console.log('⏭️ לוח שבועי כבר נשלח היום.');
    return;
  }

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  const dalleBuffer = await generateDalleImage();
  registerFont(FONT_PATH, { family: 'Noto' });
  const canvas = createCanvas(1080, 720);
  const ctx = canvas.getContext('2d');

  const bgImage = await loadImage(dalleBuffer);
  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = '64px Noto';
  ctx.textAlign = 'center';
  ctx.fillText('לוח שבועי', canvas.width / 2, 80);

  ctx.font = '32px Noto';
  SCHEDULE.forEach(([day, desc], i) => {
    const y = 150 + i * 75;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(day, canvas.width - 80, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(desc, 80, y);
  });

  const logo = await loadImage(LOGO_PATH);
  ctx.drawImage(logo, canvas.width - 160, canvas.height - 160, 120, 120);

  const date = today;
  const imagePath = path.join(__dirname, `../images/schedule_${date}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);

  const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

  const embed = new EmbedBuilder()
    .setTitle('📅 לוח השבוע – GAMERS UNITED IL')
    .setDescription('בחר באילו ימים אתה שוקל להשתתף:')
    .setImage('attachment://schedule.png')
    .setColor('#00B2FF')
    .setFooter({ text: 'נוצר אוטומטית ע״י שמעון הבוט' })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    ...SCHEDULE.slice(0, 5).map(([day], index) =>
      new ButtonBuilder()
        .setCustomId(`rsvp_${index}`)
        .setLabel(day)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const docRef = db.doc('schedule/message');
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    try {
      const msg = await channel.messages.fetch(docSnap.data().id);
      await msg.edit({ embeds: [embed], files: [attachment], components: [buttons] });
      await systemRef.set({ lastScheduleSent: today }, { merge: true });
      console.log('🔁 לוח שבועי עודכן');
      return;
    } catch (e) {
      console.warn('⚠️ ההודעה הישנה לא נמצאה. שולח חדשה...');
    }
  }

  const sentMsg = await channel.send({ embeds: [embed], files: [attachment], components: [buttons] });
  await docRef.set({ id: sentMsg.id });
  await systemRef.set({ lastScheduleSent: today }, { merge: true });
  console.log('📤 נשלח לוח שבועי חדש');
}

module.exports = { postOrUpdateWeeklySchedule };

const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// טעינת פונט עברי איכותי
registerFont(path.join(__dirname, '../assets/DejaVuSans.ttf'), {
  family: 'DejaVuSans'
});

const GOAL_MINUTES = 500;

const data = new SlashCommandBuilder()
  .setName('מצטיין')
  .setDescription('טבלת התקדמות למצטייני השבוע (גרפי, מיושר ונקי)');

function getStartOfWeek() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return start;
}

function formatDate(date) {
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const db = client.db;
  const weekStart = getStartOfWeek();
  const snapshot = await db.collection('voiceTime')
    .where('date', '>=', weekStart)
    .get();

  const totals = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.minutes || !data.date || !(data.date.toDate instanceof Function)) return;
    const id = data.userId || doc.id;
    if (!totals.has(id)) totals.set(id, 0);
    totals.set(id, totals.get(id) + data.minutes);
  });

  const active = [...totals.entries()]
    .map(([id, minutes]) => ({ id, minutes }))
    .filter(user => user.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  if (active.length === 0) {
    return interaction.editReply({
      content: 'אף אחד לא התחבר השבוע לערוץ קול.'
    });
  }

  const WIDTH = 1260;
  const PADDING = 60;
  const ROW_HEIGHT = 130;
  const BAR_WIDTH = 500;
  const BAR_HEIGHT = 28;
  const AVATAR_SIZE = 64;
  const HEIGHT = PADDING + ROW_HEIGHT * active.length + 120;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const now = new Date();
  const startDateStr = formatDate(weekStart);
  const endDateStr = formatDate(now);

  // כותרת
  ctx.font = 'bold 52px DejaVuSans';
  ctx.fillStyle = '#facc15';
  ctx.textAlign = 'right';
  ctx.fillText('מצטייני השבוע - פעילות קול', WIDTH - PADDING, PADDING);

  // תאריך
  ctx.font = '24px DejaVuSans';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`טווח: ${startDateStr} עד ${endDateStr}`, WIDTH - PADDING, PADDING + 40);

  const maxMinutes = active[0].minutes;

  for (let i = 0; i < active.length; i++) {
    const { id, minutes } = active[i];
    const user = await client.users.fetch(id).catch(() => null);
    const username = user?.username || `משתמש (${id.slice(-4)})`;
    const percent = Math.min(100, Math.round((minutes / GOAL_MINUTES) * 100));
    const y = PADDING + 80 + i * ROW_HEIGHT;

    // אוואטר
    try {
      const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(PADDING + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, PADDING, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();
    } catch {}

    const textStart = PADDING + AVATAR_SIZE + 20;

    // שם מיושר שמאלה
    ctx.font = '28px DejaVuSans';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(username, textStart, y + 26);

    // דקות
    ctx.font = '22px DejaVuSans';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${minutes} דקות`, textStart, y + 54);

    // יעד
    const remaining = Math.max(0, GOAL_MINUTES - minutes);
    if (remaining <= 0) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '18px DejaVuSans';
      ctx.fillText('הושג היעד השבועי!', textStart, y + 105);
    } else {
      ctx.fillStyle = '#f87171';
      ctx.font = '18px DejaVuSans';
      ctx.fillText(`נותרו ${remaining} דקות ליעד`, textStart, y + 105);
    }

    // גרף
    const barX = WIDTH - PADDING - BAR_WIDTH;
    const barY = y + 30;
    const fillWidth = Math.max(30, Math.round((percent / 100) * BAR_WIDTH));

    // רקע בר
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);

    // מילוי
    const grad = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
    if (minutes >= GOAL_MINUTES) {
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(1, '#fbbf24');
    } else {
      grad.addColorStop(0, '#34d399');
      grad.addColorStop(1, '#10b981');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, fillWidth, BAR_HEIGHT);

    // אחוז
    const percentText = `${percent}%`;
    ctx.font = '20px DejaVuSans-Bold';
    const textW = ctx.measureText(percentText).width;
    const inside = fillWidth > textW + 30;
    const percentX = inside ? barX + fillWidth - textW - 10 : barX + fillWidth + 10;
    ctx.fillStyle = inside ? '#ffffff' : '#10b981';
    ctx.fillText(percentText, percentX, barY + 21);
  }

  // תאריך עדכון
  ctx.font = '20px DejaVuSans';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'left';
  ctx.fillText(`עודכן: ${now.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`, PADDING, HEIGHT - 30);

  // שמירה ושליחה
  const outputPath = path.join(__dirname, '../temp/mvp_live.png');
  if (!fs.existsSync(path.dirname(outputPath))) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

  await interaction.editReply({
    content: `טבלת מצטיינים שבועית מ־${startDateStr} עד ${endDateStr}`,
    files: [outputPath]
  });
}

module.exports = {
  data,
  execute
};

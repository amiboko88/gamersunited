const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// טעינת פונט עברי תקני עם תמיכה מלאה
registerFont(path.join(__dirname, '../assets/fonts/DejaVuSans.ttf'), {
  family: 'DejaVuSans'
});

const GOAL_MINUTES = 200;

const data = new SlashCommandBuilder()
  .setName('מצטיין')
  .setDescription('📈 טבלת התקדמות חיה למצטיין השבועי (גרפי)');

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
      content: '😴 אף אחד לא התחבר השבוע לערוץ קול... תתעוררו!'
    });
  }

  const WIDTH = 1260;
  const PADDING = 50;
  const ROW_HEIGHT = 130;
  const BAR_WIDTH = 500;
  const BAR_HEIGHT = 28;
  const AVATAR_SIZE = 64;
  const HEIGHT = PADDING + ROW_HEIGHT * active.length + 140;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const startDateStr = formatDate(weekStart);
  const now = new Date();
  const endDateStr = formatDate(now);

  // כותרת מודגשת
  ctx.font = 'bold 52px DejaVuSans';
  ctx.fillStyle = '#facc15';
  ctx.textAlign = 'right';
  ctx.fillText('מצטיין השבוע (מראשון עד עכשיו)', WIDTH - PADDING, PADDING + 10);

  // שורת תאריכים
  ctx.font = '24px DejaVuSans';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`🗓️ ${startDateStr} – ${endDateStr}`, WIDTH - PADDING, PADDING + 50);

  const maxMinutes = active[0].minutes;

  for (let i = 0; i < active.length; i++) {
    const { id, minutes } = active[i];
    const user = await client.users.fetch(id).catch(() => null);
    const username = user?.username || `משתמש (${id.slice(-4)})`;
    const percent = Math.round((minutes / GOAL_MINUTES) * 100);
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

    // ✔️ שם משתמש מיושר שמאלה בלבד
    ctx.font = '28px DejaVuSans';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(username, textStart, y + 26);

    // דקות
    drawText(`${minutes} דקות`, textStart, y + 54, '22px DejaVuSans');

    // מוביל או פער
    if (i === 0) {
      drawText('👑 מוביל השבוע', textStart + 200, y + 26, '20px DejaVuSans', '#facc15');
    } else {
      const gap = maxMinutes - minutes;
      drawText(`📉 פער של ${gap} דקות מהמוביל`, textStart, y + 80, '20px DejaVuSans', '#94a3b8');
    }

    const remaining = Math.max(0, GOAL_MINUTES - minutes);
    if (remaining <= 0) {
      drawText('✅ השגת את היעד השבועי!', textStart, y + 105, '18px DejaVuSans', '#4ade80');
    } else {
      drawText(`🎯 נותרו ${remaining} דקות ליעד`, textStart, y + 105, '18px DejaVuSans', '#f87171');
    }

    // גרף התקדמות
    const barX = WIDTH - PADDING - BAR_WIDTH;
    const barY = y + 30;
    const minWidth = 30;
    const fillWidth = Math.max(minWidth, Math.round((percent / 100) * BAR_WIDTH));

    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);

    // צבע שונה למי שעבר יעד
    const grad = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
    if (minutes >= GOAL_MINUTES) {
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(1, '#fbbf24');
    } else {
      grad.addColorStop(0.0, '#34d399');
      grad.addColorStop(0.6, '#10b981');
      grad.addColorStop(1.0, '#6ee7b7');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, fillWidth, BAR_HEIGHT);

    // אחוזים
    const percentText = `${percent}%`;
    ctx.font = '20px DejaVuSans-Bold';
    const textW = ctx.measureText(percentText).width;
    const inside = fillWidth > textW + 30;
    const percentX = inside ? barX + fillWidth - textW - 10 : barX + fillWidth + 10;
    const percentColor = inside ? '#ffffff' : (minutes >= GOAL_MINUTES ? '#facc15' : '#10b981');
    ctx.fillStyle = percentColor;
    ctx.fillText(percentText, percentX, barY + 21);
  }

  // תאריך עדכון
  const updateStr = now.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  drawText(`📅 עדכון אחרון: ${updateStr}`, PADDING, HEIGHT - 30, '20px DejaVuSans', '#64748b');

  const outputPath = path.join(__dirname, '../temp/mvp_live.png');
  if (!fs.existsSync(path.dirname(outputPath))) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

  await interaction.editReply({
    content: `⬇️ MVP LIVE ⬇️\n(נמדד מהשבוע הנוכחי: ${startDateStr} - ${endDateStr})`,
    files: [outputPath]
  });

  // reset textAlign
  ctx.textAlign = 'right';

  // helper
  function drawText(text, x, y, font, color = '#ffffff') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}

module.exports = {
  data,
  execute
};

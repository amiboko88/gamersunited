const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const GOAL_MINUTES = 200;

const data = new SlashCommandBuilder()
  .setName('מצטיין')
  .setDescription('📈 טבלת התקדמות חיה למצטיין השבועי (גרפי)');

function getStartOfWeek() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // ראשון בבוקר
  return start;
}

function formatDate(date) {
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

async function execute(interaction, client) {
  await interaction.deferReply({ flags: 64 });

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
    const minutes = data.minutes;

    if (!totals.has(id)) totals.set(id, 0);
    totals.set(id, totals.get(id) + minutes);
  });

  const active = [...totals.entries()]
    .map(([id, minutes]) => ({ id, minutes }))
    .filter(user => user.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  if (active.length === 0) {
    return interaction.editReply({
      content: '😴 אף אחד לא התחבר השבוע לערוץ קול... תתעוררו!',
      ephemeral: true
    });
  }

  const maxMinutes = active[0].minutes;

  // Canvas setup
  const WIDTH = 1260;
  const PADDING = 40;
  const ROW_HEIGHT = 110;
  const BAR_WIDTH = 500;
  const BAR_HEIGHT = 32;
  const AVATAR_SIZE = 64;
  const HEIGHT = PADDING + ROW_HEIGHT * active.length + 100;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  function drawText(text, x, y, font, color = '#ffffff') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawRightAligned(text, y, font, color = '#ffffff', padding = PADDING) {
    ctx.font = font;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = color;
    ctx.fillText(text, WIDTH - padding - w, y);
  }

  const startDateStr = formatDate(weekStart);
  const now = new Date();
  const endDateStr = formatDate(now);

  drawRightAligned('מצטיין השבוע (מראשון עד עכשיו)', PADDING + 10, '42px DejaVuSans-Bold', '#facc15');
  drawRightAligned(`🗓️ ${startDateStr} – ${endDateStr}`, PADDING + 50, '24px DejaVuSans', '#94a3b8');

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

    // שם משתמש
    drawText(username, PADDING + AVATAR_SIZE + 20, y + 28, '28px DejaVuSans-Bold');

    // זמן בדקות
    drawText(`${minutes} דקות`, PADDING + AVATAR_SIZE + 20, y + 60, '22px DejaVuSans');

    // מוביל או פער
    if (i === 0) {
      drawText('👑 מוביל השבוע', PADDING + AVATAR_SIZE + 160, y + 28, '22px DejaVuSans', '#facc15');
    } else {
      const gap = maxMinutes - minutes;
      drawText(`📉 פער של ${gap} דקות מהמוביל`, PADDING + AVATAR_SIZE + 20, y + 85, '20px DejaVuSans', '#94a3b8');
    }

    // יעד
    const remaining = Math.max(0, GOAL_MINUTES - minutes);
    drawText(`🎯 נותרו ${remaining} דקות ליעד`, PADDING + AVATAR_SIZE + 20, y + 110, '18px DejaVuSans', '#f87171');

    // גרף התקדמות
    const barX = WIDTH - PADDING - BAR_WIDTH;
    const barY = y + 20;
    const fillWidth = Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH));
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(barX, barY, fillWidth, BAR_HEIGHT);

    const percentText = `${percent}%`;
    const textW = ctx.measureText(percentText).width;
    const inside = fillWidth > textW + 16;
    const percentX = inside ? barX + fillWidth - textW - 8 : barX + fillWidth + 8;
    const percentColor = inside ? '#ffffff' : '#10b981';
    drawText(percentText, percentX, barY + 23, '20px DejaVuSans-Bold', percentColor);
  }

  // תאריך עדכון
  const updateStr = now.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  drawText(`📅 עדכון אחרון: ${updateStr}`, PADDING, HEIGHT - 30, '20px DejaVuSans', '#64748b');

  const outputPath = path.join(__dirname, '../temp/mvp_live.png');
  const dirPath = path.dirname(outputPath);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  await interaction.editReply({
    content: `⬇️ MVP LIVE ⬇️\n(נמדד מהשבוע הנוכחי: ${startDateStr} - ${endDateStr})`,
    files: [outputPath]
  });
}

module.exports = {
  data,
  execute
};

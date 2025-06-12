const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

function registerMvpCommand(commands) {
  commands.push(
    new SlashCommandBuilder()
      .setName('מצטיין_שבוע')
      .setDescription('📈 טבלת התקדמות חיה למצטיין השבועי (גרפי)')
      .toJSON()
  );
}

async function execute(interaction, client) {
  await interaction.deferReply({ flags: 64 });

  const db = client.db;
  const voiceRef = await db.collection('voiceTime').get();

  const active = [];

  voiceRef.forEach(doc => {
    const data = doc.data();
    if (data.minutes > 0) {
      active.push({ id: doc.id, minutes: data.minutes });
    }
  });

  if (active.length === 0) {
    return interaction.editReply({
      content: '😴 אף אחד לא התחבר השבוע לערוץ קול... תתעוררו!',
      ephemeral: true
    });
  }

  active.sort((a, b) => b.minutes - a.minutes);
  const maxMinutes = active[0].minutes;
  const top = active.slice(0, 10);

  // Canvas config
  const WIDTH = 1260;
  const PADDING = 40;
  const ROW_HEIGHT = 100;
  const BAR_WIDTH = 500;
  const BAR_HEIGHT = 32;
  const AVATAR_SIZE = 64;
  const HEIGHT = PADDING + ROW_HEIGHT * top.length + 60;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // רקע
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // פונטים
  const fontBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const fontRegular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const fontTitle = await loadFont(fontBold, 46);
  const fontName = await loadFont(fontBold, 28);
  const fontStats = await loadFont(fontRegular, 22);
  const fontPercent = await loadFont(fontBold, 20);

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

  // כותרת
  drawRightAligned('מי הכי קרוב ל־MVP השבוע?', PADDING + 10, '46px DejaVuSans-Bold', '#facc15');

  for (let i = 0; i < top.length; i++) {
    const { id, minutes } = top[i];
    const user = await client.users.fetch(id).catch(() => null);
    const username = user?.username || `משתמש (${id.slice(-4)})`;
    const percent = Math.round((minutes / maxMinutes) * 100);
    const y = PADDING + 60 + i * ROW_HEIGHT;

    // אווטאר
    try {
      const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(PADDING + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, PADDING, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();
    } catch {}

    // שם
    drawText(username, PADDING + AVATAR_SIZE + 20, y + 28, '28px DejaVuSans-Bold');
    drawText(`${minutes} דקות`, PADDING + AVATAR_SIZE + 20, y + 60, '22px DejaVuSans');

    // בר התקדמות
    const barX = WIDTH - PADDING - BAR_WIDTH;
    const barY = y + 20;
    const fillWidth = Math.round((percent / 100) * BAR_WIDTH);
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(barX, barY, fillWidth, BAR_HEIGHT);

    // אחוז בתוך הבר
    const percentText = `${percent}%`;
    const textW = ctx.measureText(percentText).width;
    const inside = fillWidth > textW + 16;
    const percentX = inside ? barX + fillWidth - textW - 8 : barX + fillWidth + 8;
    const percentColor = inside ? '#ffffff' : '#10b981';
    drawText(percentText, percentX, barY + 23, '20px DejaVuSans-Bold', percentColor);
  }

  // שמירה
  const outputPath = path.join(__dirname, '../temp/mvp_live.png');
  const dirPath = path.dirname(outputPath);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  await interaction.editReply({
    content: '⬇️ מצב LIVE – התקדמות לעבר ה־MVP:',
    files: [outputPath]
  });
}

// פונקציית טעינת פונט
async function loadFont(path, size) {
  return `${size}px DejaVuSans`;
}

module.exports = {
  registerMvpCommand,
  execute
};

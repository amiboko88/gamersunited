const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 2000;
const HEIGHT = 1000;
const OUTPUT_PATH = path.join(__dirname, '../temp/mvp.png');

async function renderMvpImage({ username, avatarURL, minutes, wins }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // 🎨 רקע
  const bgPath = path.join(__dirname, '../assets/war_bg.png');
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const centerX = WIDTH / 2;
  const centerY = 350;
  const radius = 160;

  try {
    const avatar = await loadImage(avatarURL);

    // ✨ זוהר
    const gradient = ctx.createRadialGradient(centerX, centerY, 40, centerX, centerY, radius + 60);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 60, 0, Math.PI * 2);
    ctx.fill();

    // 🟡 מסגרת זהב
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.closePath();

    // 🖼️ אווטאר עגול
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    // 👑 כתר – מדויק לגובה
    const crownPath = path.join(__dirname, '../assets/crown.png');
    if (fs.existsSync(crownPath)) {
      const crown = await loadImage(crownPath);
      const crownWidth = 160;
      const crownHeight = 90;
      ctx.drawImage(
        crown,
        centerX - crownWidth / 2,
        centerY - radius - crownHeight + 10,
        crownWidth,
        crownHeight
      );
    }
  } catch (e) {
    console.warn('⚠️ שגיאה בטעינת אווטאר:', e.message);
  }

  // 📝 שם המשתמש עם צל
  ctx.font = 'bold 90px sans-serif';
  ctx.textAlign = 'center';
  const usernameY = centerY + radius + 80;
  ctx.fillStyle = 'black';
  ctx.fillText(username, centerX + 2, usernameY + 2);
  ctx.fillStyle = '#FFD700';
  ctx.fillText(username, centerX, usernameY);

  // 📊 נתונים עם צל
  ctx.font = '60px sans-serif';
  ctx.textAlign = 'right';
  const statsX = WIDTH - 100;
  ctx.fillStyle = 'black';
  ctx.fillText(`דקות השבוע: ${minutes}`, statsX + 2, HEIGHT - 130 + 2);
  ctx.fillText(`סה״כ זכיות: ${wins}`, statsX + 2, HEIGHT - 70 + 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(`דקות השבוע: ${minutes}`, statsX, HEIGHT - 130);
  ctx.fillText(`סה״כ זכיות: ${wins}`, statsX, HEIGHT - 70);

  // 🔗 לוגו onlyg (מתוקן)
  const logoPath = path.join(__dirname, '../assets/onlyg.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      const logoWidth = 200;
      const logoHeight = 100;
      ctx.drawImage(logo, 60, HEIGHT - logoHeight - 40, logoWidth, logoHeight);
    } catch (e) {
      console.warn('⚠️ שגיאה בטעינת לוגו:', e.message);
    }
  }

  // 💾 שמירה
  const buffer = canvas.toBuffer('image/png');
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, buffer);
  return OUTPUT_PATH;
}

module.exports = { renderMvpImage };

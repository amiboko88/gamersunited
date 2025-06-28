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

  // 👤 אווטאר + זוהר + מסגרת
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

    // 🖼️ תמונה עגולה
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    // 👑 כתר
    const crownPath = path.join(__dirname, '../assets/crown.png');
    if (fs.existsSync(crownPath)) {
      const crown = await loadImage(crownPath);
      ctx.drawImage(crown, centerX - 90, centerY - radius - 120, 180, 100);
    }
  } catch (e) {
    console.warn('⚠️ שגיאה בטעינת אווטאר:', e.message);
  }

  // 📝 שם המשתמש
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(username, centerX, centerY + radius + 80);

  // 📊 נתונים מימין
  ctx.font = '60px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`דקות השבוע: ${minutes}`, WIDTH - 100, HEIGHT - 130);
  ctx.fillText(`סה״כ זכיות: ${wins}`, WIDTH - 100, HEIGHT - 70);

  // 🔗 לוגו onlyg
  const logoPath = path.join(__dirname, '../assets/onlyg.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 60, HEIGHT - 140, 200, 100);
    } catch (e) {
      console.warn('⚠️ שגיאה בטעינת לוגו:', e.message);
    }
  }

  // 💾 שמירה לתיקיית temp
  const buffer = canvas.toBuffer('image/png');
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, buffer);
  return OUTPUT_PATH;
}

module.exports = { renderMvpImage };

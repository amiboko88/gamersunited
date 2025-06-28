// 📁 handlers/mvpRenderer.js
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 2000;
const HEIGHT = 1000;
const OUTPUT_PATH = path.join(__dirname, '../temp/mvp.png');

async function renderMvpImage({ username, avatarURL, minutes, wins }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // 🖼️ רקע מותאם (war_bg)
  const bgPath = path.join(__dirname, '../assets/war_bg.png');
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 🖼️ אווטאר מרכזי גדול עם זוהר וכתר
  try {
    const avatar = await loadImage(avatarURL);
    const centerX = WIDTH / 2;
    const avatarSize = 340;
    const glowRadius = 180;

    // זוהר
    const gradient = ctx.createRadialGradient(centerX, 380, 50, centerX, 380, glowRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, 380, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // אווטאר
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, 380, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, centerX - avatarSize / 2, 380 - avatarSize / 2, avatarSize, avatarSize);
    ctx.restore();

    // כתר מעל
    const crownPath = path.join(__dirname, '../assets/crown.png');
    if (fs.existsSync(crownPath)) {
      const crown = await loadImage(crownPath);
      ctx.drawImage(crown, centerX - 90, 130, 180, 120);
    }

  } catch (e) {
    console.warn('⚠️ שגיאה בטעינת אווטאר:', e.message);
  }

  // 📝 שם המשתמש – כותרת מתחת
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(username, WIDTH / 2, 750);

  // 📝 נתונים מימין לשמאל
  ctx.font = '60px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`⏱️ דקות השבוע: ${minutes}`, WIDTH - 120, 850);
  ctx.fillText(`🏆 סה״כ זכיות: ${wins}`, WIDTH - 120, 930);

  // 🔗 לוגו onlyg בתחתית שמאל
  const logoPath = path.join(__dirname, '../assets/onlyg.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 50, HEIGHT - 160, 200, 100);
    } catch (e) {
      console.warn('⚠️ שגיאה בטעינת לוגו:', e.message);
    }
  }

  const buffer = canvas.toBuffer('image/png');

// ווידוא קיום תיקיית temp
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, buffer);
return OUTPUT_PATH;
}

module.exports = { renderMvpImage };

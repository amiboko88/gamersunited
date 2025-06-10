// 📁 handlers/mvpRenderer.js
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 2000;
const HEIGHT = 840;
const OUTPUT_PATH = path.join(__dirname, '../temp/mvp.png');

async function renderMvpImage({ username, avatarURL, minutes, wins }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // 🔳 רקע כהה
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 🏆 כותרת
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 90px sans-serif';
  ctx.fillText('👑 MVP השבועי!', 100, 120);

  // 🧑‍🎤 שם המשתמש
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 70px sans-serif';
  ctx.fillText(`שם: ${username}`, 450, 270);

  // ⏱️ דקות + זכיות
  ctx.font = '60px sans-serif';
  ctx.fillStyle = '#d1d5db';
  ctx.fillText(`⏱️ דקות השבוע: ${minutes}`, 450, 360);
  ctx.fillText(`🏆 סה״כ זכיות: ${wins}`, 450, 440);

  // 🖼️ אווטאר (מעוגל)
  try {
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(250, 420, 150, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 100, 270, 300, 300);
    ctx.restore();
  } catch (e) {
    console.warn('⚠️ שגיאה בטעינת אווטאר:', e.message);
  }

  // 🖼️ לוגו קהילה מהתיקייה images
  const logoPath = path.join(__dirname, '../assets/logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, WIDTH - 160, HEIGHT - 160, 100, 100);
    } catch (e) {
      console.warn('⚠️ שגיאה בטעינת לוגו:', e.message);
    }
  }

  // 📦 שמירה לקובץ
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT_PATH, buffer);
  return OUTPUT_PATH;
}

module.exports = { renderMvpImage };

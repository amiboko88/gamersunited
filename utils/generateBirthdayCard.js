// 📁 utils/generateBirthdayCard.js
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

// רישום הפונט העברי (טעינה חד-פעמית)
const fontPath = path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf');
registerFont(fontPath, { family: 'NotoHebrew' });

module.exports = async function generateBirthdayCard({ fullName, birthdate, profileUrl }) {
  const width = 680;
  const height = 240;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // רקע
  ctx.fillStyle = '#f5e1ff';
  ctx.fillRect(0, 0, width, height);

  // קונפטי
  const confettiColors = ['#ff6666', '#66ccff', '#ffcc66', '#99ff99', '#cc99ff'];
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 4 + 2;
    ctx.fillStyle = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // מסגרת
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ff66cc';
  ctx.strokeRect(0, 0, width, height);

  // תמונת פרופיל בתוך עיגול
  const pfpX = 50;
  const pfpY = 70;
  const radius = 50;
  try {
    const res = await axios.get(profileUrl, { responseType: 'arraybuffer' });
    const avatar = await loadImage(res.data);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pfpX + radius, pfpY + radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, pfpX, pfpY, radius * 2, radius * 2);
    ctx.restore();
  } catch (err) {
    console.warn('⚠️ שגיאה בטעינת תמונת פרופיל:', err.message);
  }

  // טקסטים
  ctx.fillStyle = '#111';
  ctx.font = '30px NotoHebrew';
  ctx.direction = 'rtl';
  ctx.fillText(`🎉 מזל טוב ל־${fullName}!`, 640, 60);

  ctx.font = '24px NotoHebrew';
  ctx.fillText(`📅 תאריך: ${birthdate}`, 640, 110);

  const [day, month, year] = birthdate.split('.');
  const now = new Date();
  let age = now.getFullYear() - parseInt(year);
  const bdayThisYear = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day));
  if (now < bdayThisYear) age--;

  ctx.fillText(`🎂 גיל: ${age + 1}`, 640, 150);

  // לוגו בפינה שמאל תחתונה
  const logoPath = path.join(__dirname, '../assets/onlyg.png');
  if (fs.existsSync(logoPath)) {
    const logo = await loadImage(logoPath);
    ctx.drawImage(logo, 20, height - 70, 60, 60);
  }

  return canvas.toBuffer('image/png');
};

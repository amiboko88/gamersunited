const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
const { request } = require('undici');
const path = require('path');

// 📥 טעינת פונט מתוך assets
registerFont(path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf'), {
  family: 'NotoSansHebrew',
});

async function generateLeaderboardImage(users, members) {
  const width = 900;
  const rowHeight = 100;
  const height = users.length * rowHeight + 100;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 🎨 רקע כהה בהשראת צבעי הקהילה
  ctx.fillStyle = '#140C04';
  ctx.fillRect(0, 0, width, height);

  // 🟡 כותרת עליונה
  ctx.font = '32px NotoSansHebrew';
  ctx.fillStyle = '#ffcc00';
  ctx.fillText('🏆 מצטייני השבוע – GAMERS UNITED IL 🏆', 40, 50);

  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const y = 80 + i * rowHeight;
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    const medal = medals[i] || `${i + 1}.`;

    // 🖼️ ציור אוואטר
    try {
      const avatarURL = member?.displayAvatarURL({ extension: 'png', size: 128 }) || '';
      const { body } = await request(avatarURL);
      const avatar = await loadImage(await body.arrayBuffer());

      ctx.save();
      ctx.beginPath();
      ctx.arc(80, y + 40, 35, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 45, y + 5, 70, 70);
      ctx.restore();
    } catch (err) {
      console.warn(`⚠️ שגיאה בטעינת אוואטר עבור ${name}`);
    }

    // 👤 שם + ניקוד
    ctx.font = '24px NotoSansHebrew';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${medal} ${name} — ${user.score} pts`, 140, y + 35);

    // 🏷️ תגיות נוספות
    const tags = [];
    if (user.mvpWins) tags.push(`🏆 x${user.mvpWins}`);
    if (user.joinStreak) tags.push(`🔥 ${user.joinStreak}d`);
    if (tags.length) {
      ctx.font = '20px NotoSansHebrew';
      ctx.fillStyle = '#dddddd';
      ctx.fillText(tags.join('   '), 140, y + 65);
    }
  }

  // 🖼️ לוגו בפינה הימנית התחתונה
  try {
    const logoPath = path.join(__dirname, '../assets/logo.png');
    const logo = await loadImage(logoPath);
    const size = 50;
    ctx.globalAlpha = 0.7;
    ctx.drawImage(logo, width - size - 20, height - size - 20, size, size);
    ctx.globalAlpha = 1;
  } catch (err) {
    console.warn('⚠️ לא נמצא לוגו בפינה');
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardImage };

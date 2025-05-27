const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { request } = require('undici');
const path = require('path');

async function generateLeaderboardImage(users, members) {
  const width = 900;
  const rowHeight = 100;
  const height = users.length * rowHeight + 100;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 🖼️ רקע מהתמונה שלך
  const backgroundPath = path.join(__dirname, '../assets/logo.png');
  const background = await loadImage(backgroundPath);
  ctx.drawImage(background, 0, 0, width, height);

  // 🔤 כותרת
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffcc00';
  ctx.fillText('🏆 מצטייני השבוע – GAMERS UNITED IL 🏆', 40, 50);

  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const y = 80 + i * rowHeight;
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    const medal = medals[i] || `${i + 1}.`;

    // 🖼️ אוואטר
    const avatarURL = member?.displayAvatarURL({ extension: 'png', size: 128 }) || '';
    const { body } = await request(avatarURL);
    const avatar = await loadImage(await body.arrayBuffer());

    ctx.save();
    ctx.beginPath();
    ctx.arc(80, y + 40, 35, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 45, y + 5, 70, 70);
    ctx.restore();

    // 👤 שם
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${medal} ${name}`, 140, y + 35);

    // 🟢 ניקוד
    ctx.font = '20px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${user.score} pts`, 140, y + 65);

    // 🏆 תגיות
    const tags = [];
    if (user.mvpWins) tags.push(`🏆 x${user.mvpWins}`);
    if (user.joinStreak) tags.push(`🔥 ${user.joinStreak}d`);
    if (tags.length) {
      ctx.font = '18px Arial';
      ctx.fillStyle = '#dddddd';
      ctx.fillText(tags.join('  '), 320, y + 65);
    }
  }

  // 🖼️ Watermark – לוגו בפינה
  const logo = await loadImage(backgroundPath);
  const logoSize = 50;
  ctx.globalAlpha = 0.6;
  ctx.drawImage(logo, width - logoSize - 20, height - logoSize - 20, logoSize, logoSize);
  ctx.globalAlpha = 1;

  return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardImage };

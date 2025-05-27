const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { request } = require('undici');

async function generateLeaderboardImage(users, members) {
  const width = 900;
  const rowHeight = 100;
  const height = users.length * rowHeight + 80;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // רקע
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, width, height);

  // כותרת
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

    // אוואטר
    const avatarURL = member?.displayAvatarURL({ extension: 'png', size: 128 }) || '';
    const { body } = await request(avatarURL);
    const avatar = await loadImage(await body.arrayBuffer());

    ctx.save();
    ctx.beginPath();
    ctx.arc(80, y + 40, 35, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 45, y + 5, 70, 70);
    ctx.restore();

    // שם ונקודות
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${medal} ${name}`, 140, y + 35);
    ctx.font = '20px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${user.score} pts`, 140, y + 65);

    // תגים
    const tags = [];
    if (user.mvpWins) tags.push(`🏆 x${user.mvpWins}`);
    if (user.joinStreak) tags.push(`🔥 ${user.joinStreak}d`);
    if (tags.length) {
      ctx.font = '18px Arial';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(tags.join('  '), 320, y + 65);
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardImage };

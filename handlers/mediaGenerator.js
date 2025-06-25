const { createCanvas, loadImage } = require('canvas');
const path = require('path');

const WIDTH = 1000;
const HEIGHT = 562;
const AVATAR_SIZE = 100;
const MAX_PLAYERS = 5;

/**
 * @param {Collection<string, GuildMember>} players
 * @returns {Promise<Buffer>}
 */
async function generateProBanner(players) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // טען רקע ולוגו
  const background = await loadImage(path.join(__dirname, '../assets/war_bg.jpg'));
  const logo = await loadImage(path.join(__dirname, '../assets/onlyg.png'));

  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);

  // כותרת
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('תצטרפו למלחמה!', WIDTH / 2, 60);

  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#00ffff';
  ctx.fillText('FIFO ROTATION', WIDTH / 2, 120);

  // אוואטרים
  const displayed = [...players.values()].slice(0, MAX_PLAYERS);
  const spacing = WIDTH / (displayed.length + 1);
  let x = spacing;

  for (const member of displayed) {
    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
      const avatar = await loadImage(avatarURL);
      const y = 160;

      // עיגול
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, x, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      // מסגרת
      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2, true);
      ctx.stroke();

      x += spacing;
    } catch (err) {
      console.warn(`⚠️ שגיאה בטעינת אוואטר של ${member.displayName}: ${err.message}`);
    }
  }

  // לוגו בפינה
  ctx.drawImage(logo, 30, HEIGHT - 110, 80, 80);

  // כפתור מדומה (ויזואלית בלבד)
  ctx.fillStyle = 'black';
  ctx.fillRect(WIDTH - 280, HEIGHT - 80, 220, 50);
  ctx.font = '28px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('לחץ עליי', WIDTH - 170, HEIGHT - 45);

  const buffer = canvas.toBuffer('image/webp');
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('❌ יצירת buffer נכשלה');
  }

  return buffer;
}

module.exports = {
  generateProBanner
};

const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const WIDTH = 1000;
const HEIGHT = 562;
const AVATAR_SIZE = 100;
const MAX_PLAYERS = 5;

registerFont(path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf'), {
  family: 'NotoHebrew',
});

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

  // כותרות בעברית
  ctx.font = '48px "NotoHebrew"';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('חברי הצוות מחוברים כבר!', WIDTH / 2, 60);

  ctx.font = 'bold 42px Arial';
  ctx.fillStyle = '#00ffff';
  ctx.fillText('FIFO SQUAD ROTATION', WIDTH / 2, 110);

  // אוואטרים
  const displayed = [...players.values()].slice(0, MAX_PLAYERS);
  const spacing = WIDTH / (displayed.length + 1);
  let x = spacing;

  for (const member of displayed) {
    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
      const avatar = await loadImage(avatarURL);
      const y = 160;

      // אוואטר עגול
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, x, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      // אפקט זוהר
      ctx.shadowColor = 'cyan';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // שם המשתמש
      ctx.font = '20px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(member.displayName, x + AVATAR_SIZE / 2, y + AVATAR_SIZE + 25);

      x += spacing;
    } catch (err) {
      console.warn(`⚠️ שגיאה בטעינת אוואטר של ${member.displayName}: ${err.message}`);
    }
  }

  // לוגו בפינה
  ctx.drawImage(logo, 30, HEIGHT - 110, 80, 80);

  // כפתור מדומה (ויזואלי בלבד)
  ctx.fillStyle = 'black';
  ctx.fillRect(WIDTH - 280, HEIGHT - 80, 220, 50);
  ctx.font = '28px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('🎧 לחץ כדי להצטרף', WIDTH - 170, HEIGHT - 45);

  const buffer = canvas.toBuffer('image/webp');
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('❌ יצירת buffer נכשלה');
  }

  return buffer;
}

module.exports = {
  generateProBanner
};

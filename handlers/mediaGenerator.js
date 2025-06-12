const sharp = require('sharp');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

const AVATAR_SIZE = 72;
const WIDTH = 1000;
const HEIGHT = 562;

/**
 * יוצר באנר עוצמתי ב־1000x562 עם עיצוב גיימרי
 * @param {Collection<string, GuildMember>} players - שחקנים מחוברים
 * @returns {Promise<Buffer>} קובץ תמונה (webp) מוכן לדיסקורד
 */
async function generateProBanner(players) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // רקע כהה
  ctx.fillStyle = '#181a1b';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // כותרת
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Arial"';
  ctx.fillText('🎮 FIFO SQUAD מחוברים עכשיו', 40, 60);

  // אוואטרים + שמות
  let y = 110;
  for (const member of [...players.values()].slice(0, 7)) {
    try {
      const avatarURL = member.displayAvatarURL({ extension: 'png', size: 128 });
      const avatarImage = await loadImage(avatarURL);
      const x = 50;

      // אוואטר עגול
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(avatarImage, x, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      // מסגרת
      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2, true);
      ctx.stroke();

      // שם
      const displayName = member.displayName.length > 16
        ? member.displayName.slice(0, 15) + '…'
        : member.displayName;

      ctx.font = '24px "Arial"';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(displayName, x + AVATAR_SIZE + 20, y + AVATAR_SIZE / 1.5);

      y += AVATAR_SIZE + 24;
    } catch (err) {
      console.warn(`⚠️ שגיאה באוואטר של ${member.displayName}: ${err.message}`);
    }
  }

  // חתימה תחתונה
  ctx.fillStyle = '#888';
  ctx.font = '18px "Arial"';
  ctx.fillText('GAMERS UNITED IL | FIFO ACTIVE', WIDTH - 250, HEIGHT - 30);

  return canvas.toBuffer('image/webp');
}

module.exports = {
  generateProBanner
};

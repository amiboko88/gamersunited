const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

const WIDTH = 1000;
const HEIGHT = 562;
const AVATAR_SIZE = 120;
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

  const background = await loadImage(path.join(__dirname, '../assets/war_bg.png'));
  const logo = await loadImage(path.join(__dirname, '../assets/onlyg.png'));

  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);

  // כותרת ראשית - ימין לשמאל עם סימן קריאה
  ctx.font = '48px "NotoHebrew"';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText('\u200F!חברי הצוות מחוברים כבר', WIDTH - 30, 60);

  // כותרת משנה - צבע צהוב מודגש יותר
  ctx.font = 'bold 42px Arial';
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'right';
  ctx.fillText('\u200FFIFO SQUAD ROTATION', WIDTH - 30, 110);

  // אוואטרים
  const displayed = [...players.values()].slice(0, MAX_PLAYERS);
  const spacing = WIDTH / (displayed.length + 1);
  let x = spacing;

  for (const member of displayed) {
    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
      const avatar = await loadImage(avatarURL);
      const y = 160;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, x, y, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();

      // אפקט זוהר
      ctx.shadowColor = 'cyan';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // שם מודגש עם קו שחור
      const nameX = x + AVATAR_SIZE / 2;
      const nameY = y + AVATAR_SIZE + 30;
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'black';
      ctx.strokeText(member.displayName, nameX, nameY);
      ctx.fillStyle = 'white';
      ctx.fillText(member.displayName, nameX, nameY);

      x += spacing;
    } catch (err) {
      console.warn(`⚠️ שגיאה בטעינת אוואטר של ${member.displayName}: ${err.message}`);
    }
  }

  // לוגו בפינה
  ctx.drawImage(logo, 30, HEIGHT - 110, 80, 80);

  const buffer = canvas.toBuffer('image/png');
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('❌ יצירת buffer נכשלה');
  }

  return buffer;
}

module.exports = {
  generateProBanner
};

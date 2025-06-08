// 📁 handlers/gifGenerator.js

const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');
const { Readable } = require('stream');

/**
 * יוצר GIF לפי רשימת שחקנים ב-Warzone
 * @param {Collection<string, GuildMember>} players - רשימת שחקנים מחוברים
 * @returns {Promise<Buffer>} buffer של הקובץ המוכן
 */
async function generateFifoGif(players) {
  const width = 800;
  const height = 400;
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const stream = encoder.createReadStream();
  const chunks = [];

  stream.on('data', chunk => chunks.push(chunk));

  return new Promise(resolve => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));

    encoder.start();
    encoder.setRepeat(0); // לולאה אינסופית
    encoder.setDelay(600); // מ"ש בין פריימים
    encoder.setQuality(10);

    const textFrames = [
      'צוות WARZONE פעיל עכשיו',
      `שחקנים מחוברים: ${players.size}`,
      'FIFO | UNITED IL'
    ];

    for (const frame of textFrames) {
      // רקע
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);

      // מסגרת
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, width - 20, height - 20);

      // כיתוב ראשי
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 38px Arial';
      ctx.fillText(frame, 60, 120);

      // שמות שחקנים
      ctx.font = '28px Arial';
      ctx.fillStyle = '#0f0';
      let y = 180;
      players.forEach(player => {
        ctx.fillText(`• ${player.displayName}`, 80, y);
        y += 36;
      });

      // חתימה
      ctx.font = '20px Arial';
      ctx.fillStyle = '#aaa';
      ctx.fillText('UNITED IL', width - 160, height - 20);

      encoder.addFrame(ctx);
    }

    encoder.finish();
  });
}

module.exports = {
  generateFifoGif
};

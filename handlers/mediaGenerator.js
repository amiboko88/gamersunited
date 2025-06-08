// 📁 handlers/mediaGenerator.js

const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');

/**
 * יוצר באנר WARZONE בעיצוב FIFO PRO עם אוואטרים ושמות
 * @param {Collection<string, GuildMember>} players - שחקנים מחוברים
 * @returns {Promise<Buffer>} קובץ WebP מוכן לשליחה לדיסקורד
 */
async function generateProBanner(players) {
  const width = 800;
  const height = 450;
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#0f0f0f'
    }
  });

  const composites = [];

  // ✅ רקע – לוגו שקוף ממוקם בפינה
  if (fs.existsSync(LOGO_PATH)) {
    composites.push({
      input: LOGO_PATH,
      top: height - 120,
      left: width - 120
    });
  }

  // 📝 כותרת
  composites.push({
    input: Buffer.from(
      `<svg width="${width}" height="60">
        <text x="40" y="40" font-size="32" fill="white" font-family="Arial">צוות WARZONE פעיל עכשיו</text>
      </svg>`
    ),
    top: 20,
    left: 0
  });

  // 🧑‍🎤 אוואטרים + שמות
  const avatarSize = 64;
  const spacing = 30;
  const startX = 50;
  const startY = 120;
  let x = startX;

  const playersArray = [...players.values()].slice(0, 6); // עד 6 שחקנים
  for (const member of playersArray) {
    try {
      const avatarUrl = member.displayAvatarURL({ format: 'png', size: 128 });
      const avatarRes = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
      const avatarCircle = await sharp(avatarRes.data)
        .resize(avatarSize, avatarSize)
        .composite([{
          input: Buffer.from(
            `<svg><circle cx="${avatarSize/2}" cy="${avatarSize/2}" r="${avatarSize/2}" fill="none" /></svg>`
          ),
          blend: 'dest-in'
        }])
        .png()
        .toBuffer();

      composites.push({ input: avatarCircle, top: startY, left: x });

      // 🧾 שם מתחת לכל אוואטר
      composites.push({
        input: Buffer.from(
          `<svg width="${avatarSize}" height="30">
            <text x="0" y="20" font-size="16" fill="lime" font-family="Arial">${member.displayName}</text>
          </svg>`
        ),
        top: startY + avatarSize + 8,
        left: x
      });

      x += avatarSize + spacing;
    } catch (err) {
      console.warn(`⚠️ שגיאה בטעינת אוואטר של ${member.displayName}: ${err.message}`);
    }
  }

  // 🪪 חתימה
  composites.push({
    input: Buffer.from(
      `<svg width="${width}" height="30">
        <text x="${width - 240}" y="20" font-size="16" fill="#999" font-family="Arial">FIFO | UNITED IL</text>
      </svg>`
    ),
    top: height - 40,
    left: 0
  });

  return await base
    .composite(composites)
    .webp({ quality: 100 })
    .toBuffer();
}

module.exports = {
  generateProBanner
};

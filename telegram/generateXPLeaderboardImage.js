const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // נשאר כי צוין במקור.

function clean(text) {
  // תיקון הביטוי הרגולרי: הוסר הלוכסן הכפול לפני \p{L} ו-\p{N}, והמקף הועבר לסוף כדי שלא יפורש כטווח.
  return (text || "")
    .replace(/[^ \p{L}\p{N}._@!?:א-ת\u200F\u200E\u202B\u202E-]/gu, "")
    .trim();
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours} שעות`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} דקות`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} שניות`);

  return parts.join(' ');
}

async function generateXPLeaderboardImage(leaderboardData) {
  // מיון הנתונים: קודם לפי רמה (level) בסדר יורד, ואז לפי XP בסדר יורד.
  leaderboardData.sort((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    return b.xp - a.xp;
  });

  const usersHtml = leaderboardData.map((user, index) => {
    const userName = clean(user.fullName);
    const xpPercent = (user.xp / (user.level * 25 || 1)) * 100;
    const nextLevelXP = user.level * 25;

    let barColor = "#A29BFE";
    if (xpPercent >= 100) {
      barColor = "#2ECC71";
    } else if (xpPercent >= 90) {
      barColor = "#3498DB";
    } else if (xpPercent >= 75) {
      barColor = "#FFC300";
    }

    const rankNumber = index + 1;
    let rankEmoji = '';
    if (rankNumber === 1) rankEmoji = '🥇';
    else if (rankNumber === 2) rankEmoji = '🥈';
    else if (rankNumber === 3) rankEmoji = '🥉';

    const xpDisplay = `XP: ${user.xp}/${nextLevelXP} (${Math.round(xpPercent)}%)`;

    return `
      <div class="user-row">
        <div class="rank-info">
          <span class="rank-number">${rankNumber}.</span>
          ${rankEmoji ? `<span class="rank-emoji">${rankEmoji}</span>` : ''}
        </div>
        <div class="avatar-container">
          <img src="${user.avatarDataURL}" alt="${userName}" class="avatar"/>
        </div>
        <div class="user-details">
          <div class="user-name">${userName}</div>
          <div class="user-stats">
            <span class="level">רמה ${user.level}</span> ·
            <span class="xp">${xpDisplay}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${xpPercent}%; background-color: ${barColor};"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      /* איפוס גורף למניעת שוליים ורווחים */
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background-color: transparent !important;
        box-sizing: border-box !important;
      }
      .container {
        width: 100%;
        max-width: 700px;
        background-color: #2c2f33;
        border-radius: 15px;
        padding: 25px;
        font-family: 'Arial', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; /* הוספת פונטים לאימוג'ים */
        color: white;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
        direction: rtl;
        box-sizing: border-box;
      }
      h2 {
        text-align: center;
        color: #7289DA;
        margin-bottom: 25px;
        font-size: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h2 img {
        margin-left: 10px;
      }
      .user-row {
        display: flex;
        align-items: center;
        padding: 15px 0;
        border-bottom: 1px solid #40444b;
      }
      .user-row:last-child {
        border-bottom: none;
      }
      .rank-info {
        display: flex;
        align-items: center;
        width: 70px;
        font-size: 24px;
        font-weight: bold;
        color: #f0f0f0;
        justify-content: flex-start;
        margin-left: 15px;
      }
      .rank-number {
        width: 35px;
        text-align: right;
      }
      .rank-emoji {
        font-size: 28px;
        margin-right: 5px;
      }
      .avatar-container {
        width: 60px;
        height: 60px;
        border-radius: 50%; /* וודא צורה עגולה מושלמת */
        overflow: hidden;
        margin-left: 15px;
        border: 2px solid #5865F2;
        flex-shrink: 0;
      }
      .avatar {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .user-details {
        flex-grow: 1;
        text-align: right;
      }
      .user-name {
        font-size: 20px;
        font-weight: bold;
        color: #f0f0f0;
        margin-bottom: 3px;
      }
      .user-stats {
        font-size: 15px;
        color: #b0b0b0;
        margin-bottom: 5px;
      }
      .level {
        color: #99FFFF;
      }
      .xp {
        color: #FFD700;
      }
      .progress-bar-container {
        width: 95%;
        height: 10px;
        background-color: #40444b;
        border-radius: 5px;
        overflow: hidden;
        margin-right: auto;
        margin-left: 0;
      }
      .progress-bar-fill {
        height: 100%;
        border-radius: 5px;
        transition: width 0.5s ease-in-out;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2><img src="https://i.imgur.com/your-trophy-icon.png" alt="XP Trophy" width="30" height="30" /> לוח מנהיגי XP</h2>
      ${usersHtml}
    </div>
  </body>
  </html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--font-render-hinting=none",
      "--disable-gpu",
      // הוספת פונטים כדי לתמוך באימוג'ים - ייתכן ויהיה צורך בהתקנה במערכת ההפעלה של Railway
      '--font-directories=/usr/share/fonts',
      '--enable-font-antialiasing',
      '--disable-web-security' // לעיתים עוזר בבעיות טעינת תמונות/פונטים מקומיים
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 750, height: 1000, deviceScaleFactor: 2 });

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  await page.waitForSelector('.user-row img.avatar', { visible: true, timeout: 5000 }).catch(() => {
    console.log("חלק מהאווטארים לא נטענו, ממשיך בצילום.");
  });

  const containerElement = await page.$('.container');
  if (!containerElement) {
    await browser.close();
    throw new Error("אלמנט ה-Container לא נמצא לצילום מסך.");
  }

  const boundingBox = await containerElement.boundingBox();

  if (!boundingBox) {
    await browser.close();
    throw new Error("לא ניתן לקבל את גבולות אלמנט ה-Container.");
  }

  // צלם מסך של אלמנט ה-container בלבד, תוך התאמה קלה ל-clip
  const screenshotBuffer = await page.screenshot({
    clip: {
      x: Math.floor(boundingBox.x),
      y: Math.floor(boundingBox.y),
      width: Math.ceil(boundingBox.width),
      height: Math.ceil(boundingBox.height),
    },
    omitBackground: true
  });

  await browser.close();
  return screenshotBuffer;
}

module.exports = generateXPLeaderboardImage;
module.exports.clean = clean;
module.exports.formatTime = formatTime;
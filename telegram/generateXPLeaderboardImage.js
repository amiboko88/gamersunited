const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // נשאר למרות שלא בשימוש ישיר בפונקציה זו, כפי שסופק במקור.

/**
 * מנקה טקסט מתווים לא רצויים.
 * @param {string} text - הטקסט לניקוי.
 * @returns {string} הטקסט הנקי.
 */
function clean(text) {
  // תיקון הביטוי הרגולרי: הוסר הלוכסן הכפול לפני \p{L} ו-\p{N}, והמקף הועבר לסוף כדי שלא יפורש כטווח.
  return (text || "")
    .replace(/[^ \p{L}\p{N}._@!?:א-ת\u200F\u200E\u202B\u202E-]/gu, "")
    .trim();
}

/**
 * ממיר מילישניות לפורמט זמן קריא (שעות, דקות, שניות).
 * @param {number} ms - זמן במילישניות.
 * @returns {string} פורמט זמן קריא.
 */
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours} שעות`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} דקות`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} שניות`); // תמיד להציג שניות אם אין שעות/דקות

  return parts.join(' ');
}


/**
 * מחולל תמונת לוח הישגים (XP Leaderboard).
 * @param {Array<Object>} leaderboardData - מערך אובייקטים המכיל נתוני לוח הישגים.
 * @returns {Buffer} - תמונה של לוח ההישגים כ-Buffer.
 */
async function generateXPLeaderboardImage(leaderboardData) {
  // מיון הנתונים: קודם לפי רמה (level) בסדר יורד, ואז לפי XP בסדר יורד.
  leaderboardData.sort((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level; // רמה גבוהה יותר קודם
    }
    return b.xp - a.xp; // אם הרמות זהות, XP גבוה יותר קודם
  });

  const usersHtml = leaderboardData.map((user, index) => {
    const userName = clean(user.fullName);
    const xpPercent = (user.xp / (user.level * 25 || 1)) * 100; // חישוב אחוזים
    const nextLevelXP = user.level * 25; // XP נדרש לרמה הבאה

    // לוגיקה לבחירת צבע הבר (כפי שמופיע בקארד הפרופיל)
    let barColor = "#A29BFE";
    if (xpPercent >= 100) {
      barColor = "#2ECC71"; // ירוק בהיר
    } else if (xpPercent >= 90) {
      barColor = "#3498DB"; // כחול
    } else if (xpPercent >= 75) {
      barColor = "#FFC300"; // צהוב
    }

    const rankNumber = index + 1; // הדירוג בפועל לאחר המיון
    let rankEmoji = '';
    if (rankNumber === 1) rankEmoji = '🥇';
    else if (rankNumber === 2) rankEmoji = '🥈';
    else if (rankNumber === 3) rankEmoji = '🥉';

    // הצגת XP נוכחי ו-XP לרמה הבאה, ובנוסף אחוז התקדמות
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
    <style>
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background-color: transparent; /* וודא שהרקע שקוף */
      }
      .container {
        width: 100%;
        max-width: 700px; /* רוחב מרבי ללוח ההישגים */
        background-color: #2c2f33;
        border-radius: 15px;
        padding: 25px;
        font-family: 'Arial', sans-serif;
        color: white;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
        direction: rtl; /* יישור לימין עבור עברית */
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
        margin-left: 10px; /* רווח קטן בין הטקסט לתמונה */
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
        width: 70px; /* רוחב קבוע לדירוג */
        font-size: 24px;
        font-weight: bold;
        color: #f0f0f0;
        justify-content: flex-start; /* יישור לימין */
        margin-left: 15px;
      }
      .rank-number {
        width: 35px; /* רוחב קבוע למספר הדירוג */
        text-align: right; /* יישור המספר לימין */
      }
      .rank-emoji {
        font-size: 28px;
        margin-right: 5px; /* רווח בין המספר לאימוג'י */
      }
      .avatar-container {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        overflow: hidden;
        margin-left: 15px;
        border: 2px solid #5865F2;
        flex-shrink: 0; /* מונע כיווץ */
      }
      .avatar {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .user-details {
        flex-grow: 1;
        text-align: right; /* יישור לימין */
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
        color: #99FFFF; /* צבע מיוחד לרמה */
      }
      .xp {
        color: #FFD700; /* צבע מיוחד ל-XP */
      }
      .progress-bar-container {
        width: 95%;
        height: 10px;
        background-color: #40444b;
        border-radius: 5px;
        overflow: hidden;
        margin-right: auto; /* דוחף לשמאל, משאיר רווח מימין אם צריך */
        margin-left: 0; /* מוודא שהוא מתחיל מהקצה השמאלי */
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
      "--disable-gpu"
    ]
  });

  const page = await browser.newPage();
  // הגדר viewport גדול מספיק שיכיל את התוכן, אבל אנו נצלם רק את הקונטיינר
  // הגודל הכללי הוקטן כדי למנוע שוליים לבנים מיותרים
  await page.setViewport({ width: 750, height: 1000, deviceScaleFactor: 2 }); // Scale factor 2 לחדות גבוהה

  // הטען את תוכן ה-HTML והמתן עד שהרשת תהיה בטלה
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // וודא שכל הפונטים נטענו
  await page.evaluateHandle('document.fonts.ready');

  // המתן לטעינת כל התמונות בתוך '.user-row'
  // זה חשוב כדי שהאווטארים יופיעו לפני הצילום
  await page.waitForSelector('.user-row img.avatar', { visible: true, timeout: 5000 }).catch(() => {
    console.log("חלק מהאווטארים לא נטענו, ממשיך בצילום.");
  });


  const containerElement = await page.$('.container');
  if (!containerElement) {
    await browser.close();
    throw new Error("אלמנט ה-Container לא נמצא לצילום מסך.");
  }

  // קבל את הגבולות המדויקים של אלמנט ה-container
  const boundingBox = await containerElement.boundingBox();

  if (!boundingBox) {
    await browser.close();
    throw new Error("לא ניתן לקבל את גבולות אלמנט ה-Container.");
  }

  // צלם מסך של אלמנט ה-container בלבד
  const screenshotBuffer = await page.screenshot({
    clip: {
      x: boundingBox.x,
      y: boundingBox.y,
      width: boundingBox.width,
      height: boundingBox.height,
    },
    omitBackground: true // וודא שקיפות של הרקע
  });

  await browser.close();
  return screenshotBuffer;
}

module.exports = { generateXPLeaderboardImage, clean, formatTime };
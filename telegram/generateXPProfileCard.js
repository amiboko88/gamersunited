const puppeteer = require("puppeteer");
const sharp = require("sharp"); // ייבוא ספריית sharp, למרות שלא בשימוש ישיר כאן, נשאר כי צוין

function clean(text) {
  // תיקון הביטוי הרגולרי: הוסר הלוכסן הכפול לפני \p{L} ו-\p{N}, והמקף הועבר לסוף כדי שלא יפורש כטווח.
  return (text || "")
    .replace(/[^ \p{L}\p{N}._@!?:א-ת\u200F\u200E\u202B\u202E-]/gu, "")
    .trim();
}

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const name = clean(fullName);
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentText = `${Math.round(percent)}%`;

  let barColor = "#A29BFE";
  let rankColor = "#FFD700";

  // לוגיקה מעודכנת לצבעי בר ומדרגה
  if (percent >= 100) {
    barColor = "#2ECC71"; // ירוק בהיר
    rankColor = "#00FFFF"; // טורקיז
  } else if (percent >= 90) {
    barColor = "#3498DB"; // כחול
    rankColor = "#FF6347"; // כתום-אדום
  } else if (percent >= 75) {
    barColor = "#FFC300"; // צהוב
    rankColor = "#DAF7A6"; // ירוק-בהיר מאוד
  }

  const avatarContent = avatarDataURL ? `<img src="${avatarDataURL}" class="avatar-image" />` : '<div class="avatar-placeholder"></div>';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        margin: 0;
        padding: 0;
        overflow: hidden; /* מונע סקרולבר ומוודא שהתוכן לא חורג */
        background-color: transparent; /* וודא שהרקע שקוף */
      }
      .card {
        width: 100%;
        max-width: 550px; /* הוקטן מעט כדי למנוע שוליים */
        height: auto;
        background-color: #2c2f33;
        border-radius: 15px;
        color: white;
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 20px;
        box-sizing: border-box;
        position: relative;
        overflow: hidden;
      }
      .avatar-container {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        overflow: hidden;
        margin: 0 auto 15px auto;
        border: 4px solid #7289DA;
        box-shadow: 0 0 15px rgba(114, 137, 218, 0.6);
      }
      .avatar-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .avatar-placeholder {
        width: 100%;
        height: 100%;
        background-color: #5865F2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 60px;
        color: #fff;
      }
      .name {
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 8px;
        color: #f0f0f0;
      }
      .stats {
        font-size: 18px;
        color: #b0b0b0;
        margin-bottom: 15px;
      }
      .rank {
        font-size: 22px;
        font-weight: bold;
        color: ${rankColor};
        margin-bottom: 20px;
        text-shadow: 0 0 8px rgba(255, 215, 0, 0.7);
      }
      .bar {
        width: 90%;
        height: 18px;
        background-color: #40444b;
        border-radius: 10px;
        margin: 0 auto 10px auto;
        overflow: hidden;
        position: relative;
      }
      .fill {
        height: 100%;
        width: ${percent}%;
        background-color: ${barColor};
        border-radius: 10px;
        transition: width 0.5s ease-in-out;
      }
      .percent {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        font-weight: bold;
        color: rgba(255, 255, 255, 0.9);
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
      }
      .corner-logo {
        position: absolute;
        bottom: 10px;
        left: 10px;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        text-shadow: 0 0 5px rgba(0, 0, 0, 0.25); /* עדין יותר */
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="avatar-container">
        ${avatarContent}
      </div>
      <div class="name">${name}</div>
      <div class="stats">XP: ${xp}/${nextXP} · רמה ${level}</div>
      <div class="rank">${stage}</div>
      <div class="bar">
        <div class="fill"></div>
        <div class="percent">${percentText}</div>
      </div>
      <div class="corner-logo">Gamers United IL</div>
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
  // הגדר viewport שיכיל את כל התוכן הפנימי, אבל ה-body יהיה שקוף
  // הגודל הכללי הוקטן כדי למנוע שוליים לבנים מיותרים
  await page.setViewport({ width: 590, height: 400, deviceScaleFactor: 2 }); // גודל מותאם יותר לתוכן

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle('document.fonts.ready');

  // קבל את הגבולות המדויקים של אלמנט ה-card
  const cardElement = await page.$('.card');
  if (!cardElement) {
    await browser.close();
    throw new Error("אלמנט ה-card לא נמצא לצילום מסך.");
  }

  const boundingBox = await cardElement.boundingBox();

  if (!boundingBox) {
    await browser.close();
    throw new Error("לא ניתן לקבל את גבולות אלמנט ה-card.");
  }

  // צלם מסך של אלמנט ה-card בלבד
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

module.exports = { generateXPProfileCard };
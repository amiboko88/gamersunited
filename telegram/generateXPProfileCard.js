const puppeteer = require("puppeteer");
const sharp = require("sharp"); // ייבוא ספריית sharp

function clean(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת\u200F\u200E\u202B\u202E]/gu, "")
    .trim();
}

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const name = clean(fullName);
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentText = `${Math.round(percent)}%`;

  let barColor = "#A29BFE";
  let rankColor = "#FFD700";

  if (percent >= 100) {
    barColor = "#2ECC71";
    rankColor = "#00FFFF";
  } else if (percent >= 90) {
    barColor = "#3498DB";
    rankColor = "#FF6347";
  } else if (percent >= 75) {
    barColor = "#FFC300";
    rankColor = "#ADD8E6";
  } else if (percent >= 50) {
    barColor = "#FF5733";
    rankColor = "#90EE90";
  } else {
    barColor = "#E74C3C";
    rankColor = "#B0C4DE";
  }

  const stage =
    percent >= 100 ? "אגדי ✨" :
    percent >= 90 ? "סופרסייאן 🔥" :
    percent >= 75 ? "כמעט שם 💪" :
    percent >= 50 ? "מתאמן 🚀" :
    "טירון 🐣";

  // הגדרת רקע דינמי לאווטאר או תמונה בפועל
  const avatarStyle = avatarDataURL ? `background-image: url("${avatarDataURL}");` : `background-color: #FFD700;`; // עיגול צהוב אם אין תמונה

  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
    <style>
      body {
        margin: 0;
        /* הגדרת גודל שיהיה גדול מספיק כדי להכיל את הכרטיס בבטחה,
           אך לא נרנדר את כל הרקע מסביב, אלא נצלם רק את הכרטיס.
           זה מאפשר לנו להשאיר את העיצוב הפנימי רחב ויפה. */
        width: 600px;
        height: 800px;
        background: transparent; /* חשוב! רקע שקוף עבור Puppeteer, כדי שלא ייכלל בצילום */
        font-family: "Varela Round", "Noto Color Emoji", sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        direction: rtl;
        overflow: hidden;
      }

      .card {
        width: 520px;
        padding: 50px 30px;
        background: #1e1e2e;
        border-radius: 35px;
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.7), 0 0 0 5px rgba(255, 255, 255, 0.05);
        text-align: center;
        position: relative;
        overflow: hidden;
        /* כדי לוודא שהכרטיס יהיה בגודל המדויק שנצלם */
        display: inline-block; /* או block עם width ו-height מוגדרים */
      }

      .card::before {
        content: '';
        position: absolute;
        top: -50px;
        left: -50px;
        right: -50px;
        bottom: -50px;
        background: linear-gradient(45deg, #8A2BE2, #4169E1, #FFD700);
        filter: blur(80px);
        z-index: -1;
        opacity: 0.3;
        animation: rotateGlow 15s linear infinite;
      }

      @keyframes rotateGlow {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .avatar-container {
        width: 160px;
        height: 160px;
        border-radius: 50%;
        margin: 0 auto 30px;
        position: relative;
        background: linear-gradient(45deg, #FFD700, #FFBF00);
        padding: 6px;
        box-shadow: 0 0 25px rgba(255, 215, 0, 0.6);
      }

      .avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        ${avatarStyle} /* כאן נשתמש בסגנון דינמי לאווטאר */
        background-size: cover;
        background-position: center;
        border: 4px solid #1e1e2e;
        /* לוודא שהעיגול הצהוב יהיה ממוקם היטב אם אין תמונה */
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .name {
        font-size: 38px;
        font-weight: bold;
        margin-bottom: 10px;
        color: #ffffff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
      }

      .stats {
        font-size: 22px;
        color: #bbbbbb;
        margin-bottom: 15px;
      }

      .rank {
        font-size: 26px;
        color: ${rankColor};
        font-weight: bold;
        margin-bottom: 40px;
        text-shadow: 0 0 10px ${rankColor}55;
      }

      .bar {
        width: 100%;
        height: 38px;
        background: #333344;
        border-radius: 20px;
        position: relative;
        overflow: hidden;
        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4);
      }

      .fill {
        width: ${percent}%;
        height: 100%;
        border-radius: 20px;
        background: ${barColor};
        transition: width 0.8s ease-out, background-color 0.8s ease-out;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        position: relative;
      }

      .percent {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-size: 20px;
        font-weight: bold;
        color: #ffffff;
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
        z-index: 2;
      }

      .corner-logo {
        position: absolute;
        bottom: 20px;
        right: 20px;
        font-size: 16px;
        color: rgba(255, 255, 255, 0.3);
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="avatar-container">
        <div class="avatar"></div>
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
  await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle('document.fonts.ready');

  // מציאת האלמנט .card וצילום מסך רק שלו
  const cardElement = await page.$('.card');
  if (!cardElement) {
      throw new Error("Card element not found for screenshot.");
  }
  const buffer = await cardElement.screenshot({ type: "png" }); // מצלם רק את האלמנט

  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };
const puppeteer = require("puppeteer");

function clean(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת\u200F\u200E\u202B\u202E]/gu, "")
    .trim();
}

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const name = clean(fullName);
  const nextXP = level * 25; // לדוגמה, אם רמה 4, ה-XP הבא הוא 4 * 25 = 100
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentText = `${Math.round(percent)}%`;

  // צבעים דינמיים בהשראת רמות, עם גוונים עשירים יותר
  let barColor = "#A29BFE"; // סגול עדין כברירת מחדל
  let rankColor = "#FFD700"; // זהב

  if (percent >= 100) {
    barColor = "#2ECC71"; // ירוק בהיר
    rankColor = "#00FFFF"; // תכלת זוהר לאגדי
  } else if (percent >= 90) {
    barColor = "#3498DB"; // כחול בהיר
    rankColor = "#FF6347"; // כתום-אדום לסופרסייאן
  } else if (percent >= 75) {
    barColor = "#FFC300"; // צהוב-כתום
    rankColor = "#ADD8E6"; // כחול בהיר לכמעט שם
  } else if (percent >= 50) {
    barColor = "#FF5733"; // כתום בוהק
    rankColor = "#90EE90"; // ירוק בהיר למתאמן
  } else {
    barColor = "#E74C3C"; // אדום
    rankColor = "#B0C4DE"; // תכלת עדין לטירון
  }

  const stage =
    percent >= 100 ? "אגדי ✨" :
    percent >= 90 ? "סופרסייאן 🔥" :
    percent >= 75 ? "כמעט שם 💪" :
    percent >= 50 ? "מתאמן 🚀" :
    "טירון 🐣";

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
        width: 600px; /* רוחב מעט גדול יותר, נותן מקום לעיצוב */
        height: 800px; /* גובה פורטרייט נוח */
        background: radial-gradient(circle at top left, #1a1a2e, #16213e, #0f3460); /* רקע מדורג יותר */
        font-family: "Varela Round", "Noto Color Emoji", sans-serif; /* שינוי סדר גופנים */
        display: flex;
        align-items: center;
        justify-content: center;
        direction: rtl;
        overflow: hidden; /* לוודא שאין גלילה */
      }

      .card {
        width: 520px; /* התאמה לרוחב הכולל */
        padding: 50px 30px; /* ריפוד מוגדל */
        background: #1e1e2e; /* צבע כרטיס */
        border-radius: 35px; /* פינות מעוגלות יותר */
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.7), 0 0 0 5px rgba(255, 255, 255, 0.05); /* צל עמוק עם מסגרת עדינה */
        text-align: center;
        position: relative;
        overflow: hidden; /* לוודא שצללים פנימיים נחתכים */
      }

      /* אפקט זוהר עדין מאחורי הכרטיס */
      .card::before {
        content: '';
        position: absolute;
        top: -50px;
        left: -50px;
        right: -50px;
        bottom: -50px;
        background: linear-gradient(45deg, #8A2BE2, #4169E1, #FFD700); /* זוהר ססגוני */
        filter: blur(80px); /* טשטוש חזק */
        z-index: -1;
        opacity: 0.3; /* עדינות */
        animation: rotateGlow 15s linear infinite;
      }

      @keyframes rotateGlow {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .avatar-container {
        width: 160px; /* גודל אווטאר מוגדל */
        height: 160px;
        border-radius: 50%;
        margin: 0 auto 30px; /* מרווח תחתון גדול יותר */
        position: relative;
        background: linear-gradient(45deg, #FFD700, #FFBF00); /* רקע gradient למסגרת */
        padding: 6px; /* עובי המסגרת */
        box-shadow: 0 0 25px rgba(255, 215, 0, 0.6); /* צל זוהר לאווטאר */
      }

      .avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-image: url("${avatarDataURL}");
        background-size: cover;
        background-position: center;
        border: 4px solid #1e1e2e; /* מסגרת פנימית כדי "לחתוך" את הגרדיאנט */
      }

      .name {
        font-size: 38px; /* גודל גופן מוגדל */
        font-weight: bold;
        margin-bottom: 10px;
        color: #ffffff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.3); /* צל טקסט עדין */
      }

      .stats {
        font-size: 22px; /* גודל גופן מוגדל */
        color: #bbbbbb; /* צבע אפרפר עדין */
        margin-bottom: 15px;
      }

      .rank {
        font-size: 26px; /* גודל גופן מוגדל */
        color: ${rankColor}; /* צבע דינמי בהתאם לשלב */
        font-weight: bold;
        margin-bottom: 40px; /* מרווח גדול יותר לפני הפס */
        text-shadow: 0 0 10px ${rankColor}55; /* צל זוהר קטן */
      }

      .bar {
        width: 100%; /* תופס 100% מרוחב הקארד */
        height: 38px; /* גובה פס ההתקדמות */
        background: #333344; /* צבע רקע לפס */
        border-radius: 20px;
        position: relative;
        overflow: hidden; /* לוודא שהמילוי לא יוצא מהגבולות */
        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4); /* צל פנימי עדין */
      }

      .fill {
        width: ${percent}%; /* שימוש באחוזים לרוחב המילוי */
        height: 100%;
        border-radius: 20px;
        background: ${barColor}; /* צבע דינמי */
        transition: width 0.8s ease-out, background-color 0.8s ease-out; /* אנימציה חלקה */
        display: flex;
        align-items: center;
        justify-content: flex-end; /* יישור אחוזים לימין הפס */
        position: relative;
      }

      .percent {
        position: absolute; /* מיקום אבסולוטי מעל הפס */
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%); /* מרכוז מושלם */
        font-size: 20px; /* גודל גופן מוגדל */
        font-weight: bold;
        color: #ffffff;
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8); /* צל כהה יותר לאחוז */
        z-index: 2; /* לוודא שהוא מעל ה-fill */
      }

      /* לוגו או סמל קטן בפינה */
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
      "--font-render-hinting=none", // עשוי לעזור ברינדור גופנים
      "--disable-gpu"
    ]
  });

  const page = await browser.newPage();
  // הגדרת Viewport המתאימה לגודל התמונה הסופי
  await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle('document.fonts.ready'); // לוודא שגופנים נטענים

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };
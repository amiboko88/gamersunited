const puppeteer = require("puppeteer");
const sharp = require("sharp"); // ייבוא ספריית sharp, למרות שלא בשימוש ישיר כאן, נשאר כי צוין

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

  // לוגיקה מעודכנת לצבעי בר ומדרגה
  if (percent >= 100) {
    barColor = "#2ECC71"; // ירוק בהיר
    rankColor = "#00FFFF"; // טורקיז
  } else if (percent >= 90) {
    barColor = "#3498DB"; // כחול
    rankColor = "#FF6347"; // כתום-אדום
  } else if (percent >= 75) {
    barColor = "#FFC300"; // צהוב-כתום
    rankColor = "#ADD8E6"; // כחול בהיר
  } else if (percent >= 50) {
    barColor = "#FF5733"; // אדום-כתום
    rankColor = "#90EE90"; // ירוק בהיר
  } else {
    barColor = "#E74C3C"; // אדום עמוק
    rankColor = "#B0C4DE"; // אפור-כחול
  }

  const stage =
    percent >= 100 ? "אגדי ✨" :
    percent >= 90 ? "סופרסייאן 🔥" :
    percent >= 75 ? "כמעט שם 💪" :
    percent >= 50 ? "מתאמן 🚀" :
    "טירון 🐣";

  // שינוי ברירת המחדל לאווטאר: אייקון כללי נקי יותר או רקע אחיד
  const avatarContent = avatarDataURL ?
    `<div class="avatar" style="background-image: url('${avatarDataURL}');"></div>` :
    `<div class="avatar default-avatar"></div>`; // הוספנו קלאס עבור עיצוב ברירת מחדל

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
        width: 580px; /* הוקטן מעט */
        height: 750px; /* הוקטן מעט */
        background: transparent; /* חשוב! רקע שקוף עבור Puppeteer, כדי שלא ייכלל בצילום */
        font-family: "Varela Round", "Noto Color Emoji", sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        direction: rtl;
        overflow: hidden;
      }

      .card {
        width: 480px; /* הוקטן מעט */
        padding: 40px 25px; /* הוקטן מעט את הפאדינג */
        background: #1e1e2e;
        border-radius: 30px; /* מעט קטן יותר */
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 4px rgba(255, 255, 255, 0.04); /* קצת עדין יותר */
        text-align: center;
        position: relative;
        overflow: hidden;
        display: inline-block;
      }

      .card::before {
        content: '';
        position: absolute;
        top: -40px; /* מותאם לגודל החדש */
        left: -40px; /* מותאם לגודל החדש */
        right: -40px; /* מותאם לגודל החדש */
        bottom: -40px; /* מותאם לגודל החדש */
        background: linear-gradient(45deg, #8A2BE2, #4169E1, #FFD700);
        filter: blur(70px); /* טשטוש עדין יותר */
        z-index: -1;
        opacity: 0.3;
        animation: rotateGlow 15s linear infinite;
      }

      @keyframes rotateGlow {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .avatar-container {
        width: 150px; /* הוקטן מעט */
        height: 150px; /* הוקטן מעט */
        border-radius: 50%;
        margin: 0 auto 25px; /* מרווח קטן יותר */
        position: relative;
        background: linear-gradient(45deg, #A29BFE, #6C5CE7); /* שינוי הברדר מסביב לאווטאר לצבע סגול-כחול */
        padding: 5px; /* הוקטן מעט */
        box-shadow: 0 0 20px rgba(162, 155, 254, 0.5); /* צל בהתאם לצבע החדש */
      }

      .avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        border: 3px solid #1e1e2e; /* עובי בורדר קטן יותר */
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .default-avatar {
        background-color: #3f3f5a; /* צבע אפור-כחול כהה נעים יותר */
        position: relative;
      }

      .default-avatar::before {
        content: '👤'; /* איקון משתמש */
        font-size: 80px; /* גודל האיקון */
        color: #ffffff; /* צבע האיקון */
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        opacity: 0.7;
      }

      .name {
        font-size: 36px; /* הוקטן מעט */
        font-weight: bold;
        margin-bottom: 8px; /* הוקטן מעט */
        color: #ffffff;
        text-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
      }

      .stats {
        font-size: 20px; /* הוקטן מעט */
        color: #bbbbbb;
        margin-bottom: 12px; /* הוקטן מעט */
      }

      .rank {
        font-size: 24px; /* הוקטן מעט */
        color: ${rankColor};
        font-weight: bold;
        margin-bottom: 35px; /* הוקטן מעט */
        text-shadow: 0 0 8px ${rankColor}55;
      }

      .bar {
        width: 100%;
        height: 35px; /* הוקטן מעט */
        background: #333344;
        border-radius: 18px; /* מותאם לגובה */
        position: relative;
        overflow: hidden;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3); /* צל עדין יותר */
      }

      .fill {
        width: ${percent}%;
        height: 100%;
        border-radius: 18px; /* מותאם לגובה */
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
        font-size: 18px; /* הוקטן מעט */
        font-weight: bold;
        color: #ffffff;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6); /* צל עדין יותר */
        z-index: 2;
      }

      .corner-logo {
        position: absolute;
        bottom: 18px; /* מותאם */
        right: 18px; /* מותאם */
        font-size: 15px; /* הוקטן מעט */
        color: rgba(255, 255, 255, 0.25); /* עדין יותר */
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
  await page.setViewport({ width: 580, height: 750, deviceScaleFactor: 2 });
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
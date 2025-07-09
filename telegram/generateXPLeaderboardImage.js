const puppeteer = require("puppeteer");

/**
 * מנקה שם טקסט ומבטיח תמיכה באימוג'ים ותווים חוקיים בלבד.
 * אם השם ריק לאחר הניקוי, יוחזר "אנונימי".
 * @param {string} text הטקסט לניקוי.
 * @returns {string} הטקסט המנוקה או "אנונימי".
 */
function sanitizeName(text) {
  // רשימת אימוג'ים נפוצים שאנו רוצים לשמר (עלולים להיות חסרים ב-RegExp כללי)
  // כולל טווח רחב יותר של אימוג'ים כולל אימוג'י ZWJ sequences
  const allowedEmojis =
    /[\u2600-\u26FF\u2700-\u27BF\u1F600-\u1F64F\u1F300-\u1F5FF\u1F900-\u1F9FF\u1FA00-\u1FA6F\u2B50\u2B05\u2705\u274C\u2795-\u2797\u27B0\u27BF\u23F3\u231B\u23F0\u23F8-\u23FA\u25AA\u25AB\u25FE\u25FD\u2B1B\u2B1C\u25C6\u25C8\u25FC\u25FB\u2B55\u0023-\u0039\uFE0F\u20E3\u200D]/gu;
  const controlChars = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2060-\u206F]/g; // תווים בלתי נראים
  const cleanChars = /[^\p{L}\p{N} _.\-@!?א-ת]/gu; // כל מה שאינו אות, מספר, רווח, נקודה, מקף, @, !?, א-ת

  const cleaned = (text || "")
    .replace(controlChars, "") // הסר תווי בקרה
    .replace(cleanChars, (char) => allowedEmojis.test(char) ? char : "") // הסר תווים לא חוקיים למעט אימוג'ים מורשים
    .trim(); // הסר רווחים בתחילת ובסוף המחרוזת

  return cleaned.length > 0 ? cleaned : "אנונימי";
}

/**
 * מחזירה את צבע פס ההתקדמות בהתאם לאחוז.
 * @param {number} percent אחוז ההתקדמות.
 * @returns {string} קוד צבע הקסדצימלי.
 */
function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c"; // אדום
  if (percent < 0.7) return "#f9a825"; // כתום/צהוב
  return "#00e676"; // ירוק
}

/**
 * יוצר תמונה של טבלת דירוג ממשתמשי XP.
 * @param {Array<Object>} users רשימת אובייקטי משתמשים.
 * @returns {Promise<Buffer>} Buffer של תמונת PNG.
 */
async function createLeaderboardImage(users) {
  // יצירת שורות ה-HTML עבור כל משתמש
  const rowsHTML = users.map((u, i) => {
    const level = u.level || 1;
    const xp = u.xp || 0;
    const name = sanitizeName(u.fullName || u.username || "אנונימי");
    const nextXP = level * 25; // XP הנדרש לרמה הבאה
    const percent = Math.min(xp / nextXP, 1); // חישוב אחוז ההתקדמות (מקסימום 100%)
    const percentText = `${Math.round(percent * 100)}%`;
    const barColor = getBarColor(percent);
    const barWidth = Math.floor(420 * percent); // רוחב הפס בפיקסלים

    return `
    <div class="row">
      <div class="rank">#${i + 1}</div>
      <div class="info">
        <div class="name">${name}</div>
        <div class="xp">XP: ${xp}/${nextXP} · רמה ${level}</div>
        <div class="bar">
          <div class="fill" style="width: ${barWidth}px; background: ${barColor}; box-shadow: 0 0 8px ${barColor}88;"></div>
          <div class="percent">${percentText}</div>
        </div>
      </div>
    </div>`;
  }).join("\n");

  // כל קוד ה-HTML וה-CSS הדרוש לתמונה
  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');
      body {
        margin: 0;
        background: radial-gradient(circle at top, #151621, #0b0c10);
        /* סדר הפונטים חשוב: קודם פונטי אימוג'י נפוצים, אחר כך פונט העיצוב */
        font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", "Twemoji Mozilla", "Segoe UI Symbol", "Android Emoji", "Varela Round", sans-serif;
        direction: rtl;
        color: #ffffff;
        width: 1000px;
        -webkit-font-smoothing: antialiased; /* שיפור מראה הפונטים */
        -moz-osx-font-smoothing: grayscale;
      }
      .title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-top: 30px;
        margin-bottom: 20px;
        color: #FFD700; /* זהב */
      }
      .container {
        width: 920px;
        margin: 20px auto 40px;
        background: #1f1f2e; /* רקע כהה לקונטיינר */
        border-radius: 26px;
        box-shadow: 0 0 28px #00000066; /* צל עדין */
        padding: 30px 40px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #2a2a3a; /* רקע שורה */
        margin: 14px 0;
        padding: 20px;
        border-radius: 20px;
      }
      .row:nth-child(even) {
        background: #303046; /* רקע שורה זוגית */
      }
      .rank {
        font-size: 26px;
        width: 60px;
        text-align: center;
        color: #FFD700; /* זהב לדירוג */
        font-weight: bold;
      }
      .info {
        flex-grow: 1;
        text-align: center; /* מרכז את התוכן בתוך ה-info */
      }
      .name {
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 6px;
        word-break: break-word; /* שבירת מילים ארוכות */
      }
      .xp {
        font-size: 16px;
        color: #cccccc; /* צבע אפור בהיר לטקסט XP */
        margin-bottom: 10px;
      }
      .bar {
        position: relative;
        background: #3a3a3a; /* רקע פס ההתקדמות הריק */
        border-radius: 16px;
        height: 30px;
        width: 420px;
        margin: auto; /* ממורכז */
      }
      .fill {
        height: 30px;
        border-radius: 16px;
        transition: width 0.5s ease-in-out; /* אנימציה חלקה למקרה של שינוי רוחב */
      }
      .percent {
        position: absolute;
        left: 50%;
        top: 4px;
        transform: translateX(-50%);
        font-size: 15px;
        font-weight: bold;
        color: #ffffff; /* צבע אחוז ההתקדמות */
        text-shadow: 0 0 3px rgba(0,0,0,0.5); /* צל קטן לטקסט האחוז */
      }
    </style>
  </head>
  <body>
    <div class="title">‏🏆 טבלת מצטיינים</div>
    <div class="container">
      ${rowsHTML}
    </div>
  </body>
  </html>`;

  // הפעלת Puppeteer
  const browser = await puppeteer.launch({
    headless: "new", // מצב Headless חדש
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // ארגומנטים נוספים לשיפור תמיכת פונטים ורנדור
      "--disable-gpu", // שימושי בסביבות ללא GPU
      "--font-render-hinting=none", // יכול לשפר את הרנדור של פונטים מסוימים
      "--enable-font-antialiasing", // להפעלת Anti-aliasing לפונטים
      "--disable-software-rasterizer", // שימוש ב-GPU (אם זמין)
      "--disable-dev-shm-usage" // פותר בעיות ב-Docker
    ]
  });

  const page = await browser.newPage();

  // חישוב גובה דינמי של התמונה
  const headerHeight = 100; // גובה כותרת וקונטיינר עליון
  const rowHeight = 140; // גובה ממוצע של שורה בטבלה
  const containerPadding = 70; // סכום ה padding למעלה ולמטה של הקונטיינר (30+40)
  const totalHeight = headerHeight + (users.length * rowHeight) + containerPadding;


  await page.setViewport({
    width: 1000,
    height: totalHeight,
    deviceScaleFactor: 2 // מכפיל רזולוציה לפיקסלים לשיפור האיכות
  });

  // העלאת ה-HTML לדף וחיכוי לטעינה מלאה
  await page.setContent(html, { waitUntil: "networkidle0" });

  // לכידת צילום מסך
  const buffer = await page.screenshot({ type: "png" });

  // סגירת הדפדפן
  await browser.close();

  return buffer;
}

module.exports = { createLeaderboardImage };
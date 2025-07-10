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
  // שמירה על תווים עבריים ודיסקורד רלוונטיים
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת\u200F\u200E\u202B\u202E]/gu, "")
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
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} דק'`);
  if (remainingSeconds > 0) parts.push(`${remainingSeconds} שנ'`);

  return parts.length ? parts.join(', ') : '0 שנ\'';
}

/**
 * מייצר תמונת לוח מנהיגים (לידרבורד) של XP.
 * @param {Array<Object>} users - רשימת המשתמשים עם נתוני XP, רמה, זמן קול ו-URL של אווטאר.
 * @param {string} users[].username - שם המשתמש.
 * @param {number} users[].level - רמת המשתמש.
 * @param {number} users[].xp - נקודות ה-XP של המשתמש.
 * @param {number} users[].totalVoiceTime - זמן הקול הכולל של המשתמש במילישניות.
 * @param {string} users[].avatarURL - כתובת ה-URL של תמונת הפרופיל (אווטאר) של המשתמש.
 * @returns {Promise<Buffer>} Buffer של תמונת PNG של לוח המנהיגים.
 */
async function generateXPLeaderboardImage(users) {
  const now = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

  // וודא שהמשתמשים ממוינים לפי XP בסדר יורד
  const sortedUsers = [...users].sort((a, b) => b.xp - a.xp);

  const userRows = sortedUsers.map((user, index) => {
    // השתמש בפונקציית clean עבור שמות משתמשים כדי למנוע בעיות תצוגה
    const cleanUsername = clean(user.username);
    const rankEmoji = ["🥇", "🥈", "🥉"][index] || (index + 1).toString();
    // חישוב רוחב פס ה-XP יחסית לראשון - וודא שאין חלוקה באפס
    const xpBarWidth = sortedUsers.length > 0 && sortedUsers[0].xp > 0 ? (user.xp / sortedUsers[0].xp) * 100 : 0;
    const totalVoiceTime = formatTime(user.totalVoiceTime);

    return `
            <div class="user-row">
                <div class="rank">${rankEmoji}</div>
                ${user.avatarURL ? 
                    `<img src="${user.avatarURL}" class="avatar" onerror="this.style.display='none'; this.nextElementSibling.classList.add('default-avatar-placeholder');" />` :
                    `<div class="avatar default-avatar-placeholder"></div>`
                }
                <div class="user-info">
                    <span class="username">${cleanUsername}</span>
                    <span class="level">רמה ${user.level}</span>
                    <div class="xp-bar-container">
                        <div class="xp-bar" style="width: ${xpBarWidth}%;"></div>
                        <span class="xp-text">${user.xp.toLocaleString()} XP</span>
                    </div>
                    <span class="voice-time">זמן קול: ${totalVoiceTime}</span>
                </div>
            </div>
        `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>XP Leaderboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0;
            padding: 0;
            background: transparent; /* רקע שקוף לחלוטין */
            font-family: 'Noto Sans Hebrew', 'Noto Color Emoji', sans-serif;
            color: #e0e0e0;
            /* גודל אוטומטי שיותאם לתוכן המדויק של הלוח */
            width: fit-content;
            height: fit-content;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center; /* מרכוז גם אנכית */
            padding: 0; /* ללא פאדינג ב-body עצמו */
            box-sizing: border-box;
            overflow: hidden; /* למנוע גלילה מיותרת */
        }
        .container {
            width: 900px; /* רוחב קבוע ללוח */
            background-color: rgba(18, 26, 36, 0.95); /* רקע כהה יותר, פחות שקוף, מודגש */
            border-radius: 25px; /* פינות מעוגלות יותר */
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.7), 0 0 0 6px rgba(255, 255, 255, 0.08); /* צל עמוק יותר ומסגרת זוהרת */
            padding: 40px; /* פאדינג מוגדל */
            display: flex;
            flex-direction: column;
            gap: 25px; /* מרווח גדול יותר בין שורות */
            direction: rtl; /* כיוון מימין לשמאל */
            box-sizing: border-box; /* וודא שהפאדינג נכלל ברוחב */
        }
        .title {
            font-size: 50px; /* גודל כותרת מותאם */
            color: #FFD700; /* צבע זהב בולט */
            text-align: center;
            font-weight: bold;
            margin-bottom: 25px; /* מרווח תחתון לכותרת */
            text-shadow: 0 0 15px rgba(255, 215, 0, 0.6), 0 0 30px rgba(255, 215, 0, 0.4); /* צל זוהר יותר */
        }
        .user-row {
            display: flex;
            align-items: center;
            background-color: rgba(25, 35, 45, 0.85); /* רקע כהה יותר לשורת משתמש */
            border-radius: 20px; /* פינות מעוגלות יותר */
            padding: 18px 30px; /* פאדינג מוגדל בשורה */
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); /* צל עמוק יותר */
            transition: transform 0.2s ease-in-out, border-right-color 0.2s ease-in-out;
            border-right: 6px solid transparent; /* מסגרת צדדית לימין עבור RTL */
            position: relative; /* עבור איקון הדיפולט */
        }
        .user-row:hover {
            transform: translateX(8px); /* תזוזה קלה ימינה בריחוף */
            border-right-color: #4CAF50; /* ירוק כשמרחפים */
        }
        .user-row:nth-child(1) { border-right-color: #FFD700; } /* זהב למקום ראשון */
        .user-row:nth-child(2) { border-right-color: #C0C0C0; } /* כסף למקום שני */
        .user-row:nth-child(3) { border-right-color: #CD7F32; } /* ארד למקום שלישי */

        .rank {
            font-size: 40px; /* גודל אימוג'י/מספר מוגדל */
            margin-right: 25px; /* מרווח מימין עבור RTL */
            flex-shrink: 0;
            color: #fff; /* צבע לבן לאימוג'י/מספר */
            text-shadow: 1px 1px 3px rgba(0,0,0,0.7);
        }
        .avatar {
            width: 70px; /* גודל אווטאר מוגדל */
            height: 70px; /* גודל אווטאר מוגדל */
            border-radius: 50%;
            margin-right: 20px; /* מרווח מימין לאווטאר */
            border: 4px solid #3498db; /* מסגרת כחולה בולטת */
            object-fit: cover; /* חיתוך תמונה כדי למלא את העיגול */
            flex-shrink: 0;
            background-color: #3f3f5a; /* צבע דיפולט לאווטאר במקרה שאין תמונה */
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .default-avatar-placeholder {
            background-color: #3f3f5a; /* צבע אפור-כחול כהה נעים יותר לאווטאר דיפולטיבי */
            position: relative;
        }
        .default-avatar-placeholder::before {
            content: '👤'; /* איקון משתמש כברירת מחדל */
            font-size: 50px; /* גודל האיקון */
            color: #ffffff; /* צבע האיקון */
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.7;
        }

        .user-info {
            display: flex;
            flex-direction: column;
            flex-grow: 1; /* תופס את שאר המקום */
            align-items: flex-end; /* יישור טקסט לימין ב-RTL */
            text-align: right;
        }
        .username {
            font-size: 28px; /* שם משתמש מוגדל */
            font-weight: bold;
            color: #7afffc; /* צבע טורקיז בהיר ובולט */
            margin-bottom: 5px;
            white-space: nowrap; /* מונע שבירת שורות בשם משתמש */
            overflow: hidden; /* מסתיר גלישה במידת הצורך */
            text-overflow: ellipsis; /* מוסיף 3 נקודות אם הטקסט ארוך מדי */
            max-width: 100%; /* מגביל את הרוחב של השם */
        }
        .level {
            font-size: 20px; /* גודל רמה מותאם */
            color: #a0a0a0;
            margin-bottom: 10px;
        }
        .xp-bar-container {
            width: 100%;
            height: 18px; /* גובה פס XP מוגדל */
            background-color: #333344; /* רקע פס XP כהה יותר */
            border-radius: 9px; /* פינות מעוגלות */
            overflow: hidden;
            margin-bottom: 8px;
            position: relative;
            box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4); /* צל פנימי עדין */
        }
        .xp-bar {
            height: 100%;
            background: linear-gradient(to right, #4CAF50, #8bc34a); /* גראדיאנט ירוק יפה */
            border-radius: 9px;
            transition: width 0.5s ease-in-out;
            /* הוספת זוהר קטן לפס המילוי */
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
        }
        .xp-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 16px; /* גודל טקסט XP מותאם */
            font-weight: bold;
            color: #fff;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.8); /* צל טקסט בולט יותר */
            z-index: 1; /* וודא שהטקסט מעל הפס */
        }
        .voice-time {
            font-size: 18px; /* גודל זמן קול מותאם */
            color: #b0c4de;
            margin-top: 5px;
        }
        .footer {
            margin-top: 30px; /* מרווח עליון מהלוח */
            text-align: left; /* יישור לימין ב-RTL */
            width: 100%; /* רוחב מלא בתוך ה-container */
            padding-right: 40px; /* פאדינג מימין */
            font-size: 16px;
            color: #95a5a6;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
            box-sizing: border-box; /* וודא שהפאדינג נכלל ברוחב */
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="title">🏆 לוח מנהיגי XP</div>
        ${userRows}
    </div>
    <div class="footer">עודכן: ${now}</div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: "new", // מצב Headless חדש
    args: [
      '--no-sandbox', // חיוני לסביבות שרת
      '--disable-setuid-sandbox',
      '--font-render-hinting=none', // לשיפור רינדור פונטים
      '--disable-gpu', // מומלץ על שרתים ללא GPU
      '--enable-font-antialiasing', // אנטי-אליאסינג לפונטים
      '--disable-lcd-text', // עשוי לשפר רינדור ב-Linux
      '--disable-dev-shm-usage' // למנוע בעיות זיכרון ב-Docker/Railway
    ],
    ignoreDefaultArgs: ['--enable-automation'], // הסרת הדגל של Puppeteer שמציין שהוא פועל באמצעות אוטומציה
  });

  const page = await browser.newPage();
  // הגדר viewport גדול מספיק שיכיל את התוכן, אבל אנו נצלם רק את הקונטיינר
  await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 }); // Scale factor 2 לחדות גבוהה

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
    throw new Error("לא ניתן היה לקבל את גבולות אלמנט ה-container.");
  }

  // צלם מסך של אלמנט ה-container בלבד, עם רקע שקוף
  const buffer = await page.screenshot({
    type: 'png',
    clip: {
      x: boundingBox.x,
      y: boundingBox.y,
      width: boundingBox.width,
      height: boundingBox.height,
    },
    omitBackground: true, // זה המפתח לרקע שקוף
  });

  await browser.close();
  return buffer;
}

module.exports = generateXPLeaderboardImage;
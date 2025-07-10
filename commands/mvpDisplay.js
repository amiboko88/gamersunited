const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // נשאר למרות שלא בשימוש ישיר בפונקציה זו, כפי שסופק במקור.

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

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
 * מייצר תמונה של אלופי שיחות קול.
 * @param {Array<Object>} users - רשימת המשתמשים המובילים עם נתוני שם, דקות שיחה ו-URL של אווטאר.
 * @param {string} users[].username - שם המשתמש.
 * @param {number} users[].minutes - דקות השיחה של המשתמש.
 * @param {string} users[].avatarURL - כתובת ה-URL של תמונת הפרופיל (אווטאר) של המשתמש.
 * @returns {Promise<Buffer>} Buffer של תמונת PNG של אלופי השיחות.
 */
async function generateTopImage(users) {
  // דירוגים עבור 5 המשתמשים המובילים
  const ranks = ["🥇", "🥈", "🥉", "💎", "💎"];

  /**
   * בונה את קוד ה-HTML עבור משתמש בודד.
   * @param {Object} u - אובייקט המשתמש.
   * @param {string} u.username - שם המשתמש.
   * @param {number} u.minutes - דקות שיחה.
   * @param {string} u.avatarURL - URL של אווטאר.
   * @param {string} rank - אימוג'י הדירוג.
   * @returns {string} קוד HTML של אלמנט משתמש.
   */
  function userHTML(u, rank) {
    const cleanedUsername = clean(u.username); // מנקה את שם המשתמש
    return `
      <div class="user">
        <div class="rank">${rank}</div>
        ${u.avatarURL ? 
            `<img src="${u.avatarURL}" class="avatar" onerror="this.onerror=null; this.src='https://cdn.discordapp.com/embed/avatars/0.png';" />` : // טיפול בשגיאת טעינה
            `<img src="https://cdn.discordapp.com/embed/avatars/0.png" class="avatar" />` // אווטאר דיפולטיבי אם אין URL
        }
        <div class="name">${cleanedUsername}</div>
        <div class="minutes">${u.minutes.toLocaleString()} דקות</div>
      </div>`;
  }

  // חלוקה ל-3 המובילים ו-2 הבאים
  const top3 = users.slice(0, 3).map((u, i) => userHTML(u, ranks[i])).join('\n');
  const bottom2 = users.slice(3, 5).map((u, i) => userHTML(u, ranks[i + 3])).join('\n');
  const now = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet"> 
  <style>
    body {
      margin: 0;
      padding: 0;
      /* רקע משופר: גראדיאנט עמוק עם אפקטים עדינים */
      background: 
        radial-gradient(circle at 70% 20%, rgba(30, 0, 80, 0.3) 0%, transparent 50%),
        radial-gradient(circle at 30% 80%, rgba(0, 80, 80, 0.2) 0%, transparent 50%),
        radial-gradient(circle, #0a0f1f 0%, #060912 100%); /* בסיס כהה יותר */
      font-family: 'Noto Sans Hebrew', 'Noto Color Emoji', sans-serif;
      color: #fff;
      width: 1920px;
      min-height: 1080px; /* השתמש ב-min-height כדי לאפשר לתוכן לדחוף את הגובה */
      overflow: hidden; /* הסר במידה ויהיו בעיות גלילה קטנות */
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between; /* פיזור אלמנטים באופן שווה */
      padding: 40px 0 40px 0; /* הקטנת פאדינג עליון ותחתון */
      box-sizing: border-box; /* וודא שפאדינג נכלל ברוחב/גובה */
    }
    .title {
      text-align: center;
      font-size: 70px; /* הקטנת גודל כותרת */
      color: #facc15;
      font-weight: bold;
      margin-bottom: 40px; /* הקטנת מרווח כותרת */
      text-shadow: 0 0 15px #facc15aa, 0 0 30px #facc1555;
      flex-shrink: 0; /* מונע מהכותרת להתכווץ */
    }
    .top-row, .bottom-row {
      display: flex;
      justify-content: center;
      gap: 100px; /* הקטנת מרווח בין משתמשים בשורה */
      margin-top: 30px; /* הקטנת מרווח עליון בין שורות */
      width: 100%;
      flex-grow: 1; /* מאפשר לשורות לצמוח ולתפוס מקום */
      align-items: center; /* יישור אנכי במרכז של כל שורה */
    }
    .user {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 18px; /* הקטנת רדיוס פינות */
      padding: 25px 35px; /* הקטנת פאדינג פנימי */
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5); /* הקטנת צל */
      transition: transform 0.3s ease-in-out;
      width: 280px; /* הגדרת רוחב מקסימלי קבוע כדי לשלוט בגודל הכולל */
      flex-shrink: 0; /* מונע התכווצות יתר */
    }
    .user:hover {
        transform: translateY(-8px) scale(1.01); /* שינוי קל באפקט ריחוף */
    }
    .avatar {
      width: 160px; /* הקטנת גודל אווטאר */
      height: 160px; /* הקטנת גודל אווטאר */
      border-radius: 50%;
      box-shadow: 0 0 12px #8e44ad, 0 0 25px #2980b9; /* הקטנת צל אווטאר */
      margin-bottom: 20px; /* הקטנת מרווח מתחת לאווטאר */
      object-fit: cover;
      border: 4px solid #6c5ce7; /* הקטנת עובי בורדר */
    }
    .rank {
      font-size: 50px; /* הקטנת גודל ראנק */
      margin-bottom: 12px; /* הקטנת מרווח מתחת לראנק */
    }
    .name {
      font-size: 32px; /* הקטנת גודל שם */
      font-weight: bold;
      margin-bottom: 6px; /* הקטנת מרווח מתחת לשם */
      color: #a29bfe;
      white-space: nowrap; /* מונע שבירת שורות */
      overflow: hidden; /* מסתיר טקסט שחורג מהגבולות */
      text-overflow: ellipsis; /* מוסיף שלוש נקודות בסוף טקסט ארוך */
      max-width: 100%; /* ודא שהשם לא חורג מרוחב ה-user div */
    }
    .minutes {
      font-size: 24px; /* הקטנת גודל דקות */
      color: #dfe6e9;
      font-weight: 500;
    }
    .footer {
      /* מיקום סטטי בתוך ה-flex container של ה-body */
      margin-top: 40px; /* הקטנת מרווח עליון של פוטר */
      text-align: right;
      width: 100%; /* וודא שהוא תופס את כל הרוחב כדי שה-text-align יעבוד */
      padding-right: 50px; /* הזחה מימין */
      font-size: 20px; /* הקטנת גודל פוטר */
      color: #95a5a6;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="title">👑 אלופי כל הזמנים בשיחות קול</div>
  <div class="top-row">
    ${top3}
  </div>
  <div class="bottom-row">
    ${bottom2}
  </div>
  <div class="footer">עודכן: ${now}</div>
</body>
</html>`;


  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',
      '--disable-gpu',
      '--disable-dev-shm-usage', // חשוב במיוחד עבור Railway וסביבות Docker
      '--no-zygote', // עשוי לעזור בסביבות מסוימות
      '--single-process' // עשוי לעזור בסביבות עם משאבים מוגבלים
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 }); // רזולוציה קבועה עבור התמונה הסופית
  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.evaluateHandle('document.fonts.ready');

  // המתן לטעינת כל התמונות (אווטארים)
  await page.waitForSelector('.avatar', { visible: true, timeout: 5000 })
    .catch(e => console.log('אזהרה: חלק מהאווטארים לא נטענו בזמן.', e.message));

  const buffer = await page.screenshot({ type: 'png', fullPage: false }); // fullPage: false כדי לצלם רק את ה-viewport
  await browser.close();
  return buffer;
}


async function execute(interaction, client) {
  try {
    await interaction.deferReply();

    const db = client.db;
    const snapshot = await db.collection('voiceLifetime').get();

    const users = [];
    snapshot.forEach(doc => {
      const minutes = doc.data()?.total || 0;
      if (minutes > 0) {
        users.push({ id: doc.id, minutes });
      }
    });

    const topUsers = users
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5); // לוודא שאנחנו עובדים עם 5 המשתמשים המובילים בלבד

    const enriched = await Promise.all(topUsers.map(async (u) => {
      const user = await client.users.fetch(u.id).catch(() => null);
      const username = user?.username || `משתמש ${u.id.slice(-4)}`;
      // וודא ש-avatarURL תמיד מחזיר URL תקין או דיפולטיבי
      const avatarURL = user?.displayAvatarURL({ extension: 'png', size: 128 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png'; // אווטאר דיפולטיבי של דיסקורד
      return {
        username,
        minutes: u.minutes,
        avatarURL
      };
    }));

    const buffer = await generateTopImage(enriched);

    // נתיב זמני לשמירת התמונה - חשוב ל-Railway / סביבות שרת
    const filePath = path.join('/tmp', `top_voice_${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);

    await interaction.editReply({
      files: [filePath]
    });

    // מחיקת הקובץ לאחר שליחתו (כעבור 10 שניות)
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('שגיאה במחיקת קובץ זמני:', err);
      });
    }, 10000);

  } catch (err) {
    console.error('❌ שגיאה ביצירת טבלת אלופים:', err);
    // וודא שניתנת תגובה למשתמש גם במקרה של שגיאה
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'שגיאה בהפקת טבלת האלופים 😕', ephemeral: true });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'שגיאה בהפקת טבלת האלופים 😕' });
    }
  }
}

module.exports = {
  data,
  execute
};
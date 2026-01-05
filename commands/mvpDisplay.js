// 📁 commands/mvpDisplay.js
const { SlashCommandBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
// ✅ כאן התיקון הקריטי: אנחנו מייבאים את ה-db ישירות מהקובץ ששלחת לי עכשיו
const db = require('../utils/firebase'); 

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

/**
 * מנקה טקסט מתווים לא רצויים.
 */
function clean(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת\u200F\u200E\u202B\u202E]/gu, "")
    .trim();
}

/**
 * מייצר תמונה של אלופי שיחות קול.
 */
async function generateTopImage(users) {
  const ranks = ["🥇", "🥈", "🥉", "💎", "💎"];

  function userHTML(u, rank) {
    const cleanedUsername = clean(u.username);
    return `
      <div class="user">
        <div class="rank">${rank}</div>
        ${u.avatarURL ? 
            `<img src="${u.avatarURL}" class="avatar" onerror="this.onerror=null; this.src='https://cdn.discordapp.com/embed/avatars/0.png';" />` : 
            `<img src="https://cdn.discordapp.com/embed/avatars/0.png" class="avatar" />`
        }
        <div class="name">${cleanedUsername}</div>
        <div class="minutes">${u.minutes.toLocaleString()} דקות</div>
      </div>`;
  }

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
      background: 
        radial-gradient(circle at 70% 20%, rgba(30, 0, 80, 0.3) 0%, transparent 50%),
        radial-gradient(circle at 30% 80%, rgba(0, 80, 80, 0.2) 0%, transparent 50%),
        radial-gradient(circle, #0a0f1f 0%, #060912 100%);
      font-family: 'Noto Sans Hebrew', 'Noto Color Emoji', sans-serif;
      color: #fff;
      width: 1920px;
      min-height: 1080px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 40px 0 40px 0;
      box-sizing: border-box;
    }
    .title {
      text-align: center;
      font-size: 70px;
      color: #facc15;
      font-weight: bold;
      margin-bottom: 40px;
      text-shadow: 0 0 15px #facc15aa, 0 0 30px #facc1555;
      flex-shrink: 0;
    }
    .top-row, .bottom-row {
      display: flex;
      justify-content: center;
      gap: 100px;
      margin-top: 30px;
      width: 100%;
      flex-grow: 1;
      align-items: center;
    }
    .user {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 18px;
      padding: 25px 35px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s ease-in-out;
      width: 280px;
      flex-shrink: 0;
    }
    .avatar {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      box-shadow: 0 0 12px #8e44ad, 0 0 25px #2980b9;
      margin-bottom: 20px;
      object-fit: cover;
      border: 4px solid #6c5ce7;
    }
    .rank {
      font-size: 50px;
      margin-bottom: 12px;
    }
    .name {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 6px;
      color: #a29bfe;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .minutes {
      font-size: 24px;
      color: #dfe6e9;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      text-align: right;
      width: 100%;
      padding-right: 50px;
      font-size: 20px;
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
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--single-process'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');

  // המתנה לטעינת האווטארים
  await page.waitForSelector('.avatar', { visible: true, timeout: 5000 })
    .catch(e => console.log('אזהרה: חלק מהאווטארים לא נטענו בזמן.', e.message));

  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  await browser.close();
  return buffer;
}

// ✅ הסרתי את client מהפרמטרים כי הוא לא נדרש יותר עבור ה-DB
async function execute(interaction) {
  try {
    await interaction.deferReply();

    // קריאה ישירה ל-DB שיובא בראש הקובץ
    const snapshot = await db.collection('voiceLifetime').get();

    const users = [];
    snapshot.forEach(doc => {
      const minutes = doc.data()?.total || 0;
      if (minutes > 0) {
        users.push({ id: doc.id, minutes });
      }
    });

    // מיון 5 המובילים
    const topUsers = users
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    // העשרת הנתונים עם מידע מדיסקורד (כאן אנחנו משתמשים ב-interaction.client וזה תקין)
    const enriched = await Promise.all(topUsers.map(async (u) => {
      const user = await interaction.client.users.fetch(u.id).catch(() => null);
      const username = user?.username || `משתמש ${u.id.slice(-4)}`;
      const avatarURL = user?.displayAvatarURL({ extension: 'png', size: 128 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png';
      return {
        username,
        minutes: u.minutes,
        avatarURL
      };
    }));

    const buffer = await generateTopImage(enriched);

    // שמירה זמנית
    const filePath = path.join('/tmp', `top_voice_${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);

    await interaction.editReply({
      files: [filePath]
    });

    // מחיקת הקובץ
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('שגיאה במחיקת קובץ זמני:', err);
      });
    }, 10000);

  } catch (err) {
    console.error('❌ שגיאה ביצירת טבלת אלופים:', err);
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
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

async function generateTopImage(users) {
  const ranks = ["🥇", "🥈", "🥉", "💎", "💎"]; 

  function userHTML(u, rank) {
    return `
      <div class="user">
        <div class="rank">${rank}</div>
        <img src="${u.avatarURL}" class="avatar" />
        <div class="name">${u.username}</div>
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
      /* רקע משופר: הוספת שכבת גראדיאנט נוספת ואפקט עדין */
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
      padding: 60px 0 60px 0; /* פאדינג מוגדל מלמעלה ולמטה כדי למנוע חיתוך */
      box-sizing: border-box; /* וודא שפאדינג נכלל ברוחב/גובה */
    }
    .title {
      text-align: center;
      font-size: 80px;
      color: #facc15;
      font-weight: bold;
      margin-bottom: 60px; /* מרווח תחתון נוסף */
      text-shadow: 0 0 15px #facc15aa, 0 0 30px #facc1555;
      flex-shrink: 0; /* מונע מהכותרת להתכווץ */
    }
    .top-row, .bottom-row {
      display: flex;
      justify-content: center;
      gap: 150px;
      margin-top: 40px;
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
      border-radius: 20px;
      padding: 30px 40px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s ease-in-out;
    }
    .user:hover {
        transform: translateY(-10px) scale(1.02);
    }
    .avatar {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      box-shadow: 0 0 15px #8e44ad, 0 0 30px #2980b9;
      margin-bottom: 25px;
      object-fit: cover;
      border: 5px solid #6c5ce7;
    }
    .rank {
      font-size: 60px;
      margin-bottom: 15px;
    }
    .name {
      font-size: 36px;
      font-weight: bold;
      margin-bottom: 8px;
      color: #a29bfe;
    }
    .minutes {
      font-size: 28px;
      color: #dfe6e9;
      font-weight: 500;
    }
    .footer {
      /* מיקום סטטי בתוך ה-flex container של ה-body */
      /* ה-position: absolute הוסר כדי למנוע יציאה מהזרימה */
      margin-top: 60px; /* מרווח עליון מוגדל כדי להרחיק מהתוכן */
      text-align: right;
      width: 100%; /* וודא שהוא תופס את כל הרוחב כדי שה-text-align יעבוד */
      padding-right: 70px; /* הזחה מימין */
      font-size: 24px;
      color: #95a5a6;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      flex-shrink: 0; /* מונע מהפוטר להתכווץ */
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
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.evaluateHandle('document.fonts.ready');

  const buffer = await page.screenshot({ type: 'png' });
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
      .slice(0, 5);

    const enriched = await Promise.all(topUsers.map(async (u) => {
      const user = await client.users.fetch(u.id).catch(() => null);
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

    const filePath = path.join('/tmp', `top_voice_${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);

    await interaction.editReply({
      files: [filePath]
    });

    setTimeout(() => {
      fs.unlink(filePath, () => {});
    }, 10000);

  } catch (err) {
    console.error('❌ שגיאה ביצירת טבלת אלופים:', err);
    if (!interaction.replied) {
      await interaction.editReply({ content: 'שגיאה בהפקת טבלת האלופים 😕' });
    }
  }
}

module.exports = {
  data,
  execute
};
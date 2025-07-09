const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

async function generateTopImage(users) {
  // שימוש בתווי אימוג'י אמיתיים ישירות ב-HTML לעקביות טובה יותר
  // והוספת אימוג'י יהלום למקומות 4 ו-5
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
  <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet"> <style>
    body {
      margin: 0;
      padding: 0;
      background: radial-gradient(circle, #0f172a, #0a0f1f);
      font-family: 'Noto Sans Hebrew', 'Noto Color Emoji', sans-serif; /* תעדוף Noto Color Emoji */
      color: #fff;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      display: flex; /* שימוש ב-flexbox לפריסה ראשית */
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .title {
      text-align: center;
      font-size: 80px; /* גודל גופן מוגדל */
      color: #facc15;
      font-weight: bold;
      padding-top: 40px;
      margin-bottom: 60px; /* מרווח תחתון נוסף */
      text-shadow: 0 0 15px #facc15aa, 0 0 30px #facc1555; /* צל טקסט משופר */
    }
    .top-row, .bottom-row {
      display: flex;
      justify-content: center;
      gap: 150px; /* רווח מוגדל */
      margin-top: 40px; /* מרווח עליון מותאם */
      width: 100%; /* וודא ששורות תופסות רוחב מלא למרכוז */
    }
    .user {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: rgba(0, 0, 0, 0.2); /* רקע עדין לכרטיסי משתמש */
      border-radius: 20px; /* פינות מעוגלות */
      padding: 30px 40px; /* ריפוד מוגדל */
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); /* צל עמוק יותר */
      transition: transform 0.3s ease-in-out; /* אפקט ריחוף חלק */
    }
    .user:hover {
        transform: translateY(-10px) scale(1.02);
    }
    .avatar {
      width: 180px; /* גודל אווטאר מוגדל */
      height: 180px;
      border-radius: 50%;
      box-shadow: 0 0 15px #8e44ad, 0 0 30px #2980b9; /* צל תוסס יותר */
      margin-bottom: 25px; /* מרווח מוגדל */
      object-fit: cover;
      border: 5px solid #6c5ce7; /* מסגרת עדינה נוספה */
    }
    .rank {
      font-size: 60px; /* גודל אימוג'י מוגדל */
      margin-bottom: 15px; /* מרווח מוגדל */
    }
    .name {
      font-size: 36px; /* גודל גופן מוגדל */
      font-weight: bold;
      margin-bottom: 8px;
      color: #a29bfe; /* צבע מעט שונה */
    }
    .minutes {
      font-size: 28px; /* גודל גופן מוגדל */
      color: #dfe6e9; /* צבע בהיר יותר */
      font-weight: 500;
    }
    .footer {
      position: absolute;
      bottom: 40px; /* מיקום מותאם */
      right: 70px; /* מיקום מותאם */
      font-size: 24px; /* גודל גופן מוגדל */
      color: #95a5a6; /* צבע רך יותר */
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
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
      // הוסף ארגומנטים כדי לוודא שגופני אימוג'י זמינים
      '--font-render-hinting=none', // עשוי לעזור בבעיות רינדור גופנים
      '--disable-gpu' // לרוב טוב לסביבות headless
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // אופציונלי: המתן לטעינת גופנים
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
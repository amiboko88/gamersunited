const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

async function generateTopImage(users) {
  const ranks = ["🥇", "🥈", "🥉", "💬", "💬"];

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
  <style>
    body {
      margin: 0;
      padding: 0;
      background: radial-gradient(circle, #0f172a, #0a0f1f);
      font-family: 'Noto Sans Hebrew', sans-serif;
      color: #fff;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
    }
    .title {
      text-align: center;
      font-size: 64px;
      color: #facc15;
      font-weight: bold;
      padding-top: 40px;
      text-shadow: 0 0 8px #facc15aa;
    }
    .top-row, .bottom-row {
      display: flex;
      justify-content: center;
      gap: 120px;
      margin-top: 60px;
    }
    .user {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .avatar {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      box-shadow: 0 0 12px #00000088;
      margin-bottom: 20px;
      object-fit: cover;
    }
    .rank {
      font-size: 44px;
      margin-bottom: 8px;
    }
    .name {
      font-size: 30px;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .minutes {
      font-size: 24px;
      color: #cbd5e1;
    }
    .footer {
      position: absolute;
      bottom: 30px;
      right: 60px;
      font-size: 20px;
      color: #64748b;
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
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

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

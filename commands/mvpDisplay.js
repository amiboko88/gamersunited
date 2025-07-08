const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const data = new SlashCommandBuilder()
  .setName('האלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

async function generateTopImage(users) {
  const rowsHTML = await Promise.all(users.map(async ({ username, minutes, avatarURL }, i) => {
    const safeName = (username || '').replace(/[<>"&]/g, '');
    return `
      <div class="row">
        <div class="avatar">
          <img src="${avatarURL}" />
        </div>
        <div class="info">
          <div class="name">${safeName}</div>
          <div class="minutes">${minutes.toLocaleString()} דקות מצטברות</div>
        </div>
      </div>`;
  }));

  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #0f172a;
        font-family: "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
        width: 1920px;
        height: 1080px;
        color: #ffffff;
        direction: rtl;
      }
      .container {
        width: 1700px;
        margin: 0 auto;
        padding-top: 80px;
      }
      .title {
        font-size: 64px;
        color: #facc15;
        text-align: center;
        font-weight: bold;
        margin-bottom: 50px;
        text-shadow: 0 0 6px #facc1577;
      }
      .row {
        display: flex;
        align-items: center;
        margin-bottom: 40px;
      }
      .avatar img {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        box-shadow: 0 0 10px #00000088;
        margin-left: 30px;
      }
      .info {
        flex-grow: 1;
      }
      .name {
        font-size: 40px;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .minutes {
        font-size: 28px;
        color: #cbd5e1;
      }
      .footer {
        position: absolute;
        bottom: 30px;
        right: 60px;
        font-size: 22px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="title">👑 אלופי כל הזמנים בשיחות קול</div>
      ${rowsHTML.join('\n')}
      <div class="footer">עודכן: ${new Date().toLocaleString('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short'
      })}</div>
    </div>
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

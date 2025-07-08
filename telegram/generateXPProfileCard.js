const puppeteer = require("puppeteer");

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentRounded = Math.round(percent);
  const barWidth = Math.round(500 * (percent / 100));
  const barColor = percent < 40 ? "#e74c3c" : percent < 70 ? "#f9a825" : "#00e676";

  const stage =
    percent >= 100 ? "💎 אגדי" :
    percent >= 90 ? "🧠 סופרסייאן" :
    percent >= 75 ? "🔥 כמעט שם" :
    percent >= 50 ? "⚡ מתאמן" :
    "🐢 טירון";

  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
    <style>
      body {
        margin: 0;
        width: 900px;
        height: 500px;
        background: radial-gradient(circle, #101014, #0b0b10);
        font-family: 'Varela Round', sans-serif;
        color: #fff;
      }
      .card {
        margin: 40px auto;
        padding: 30px;
        width: 800px;
        background: #1e1e2e;
        border-radius: 24px;
        box-shadow: 0 0 30px #00000088;
        text-align: center;
      }
      .title {
        font-size: 42px;
        color: #FFD700;
        margin-bottom: 20px;
        text-shadow: 0 0 5px #ffd70088;
      }
      .avatar {
        width: 160px;
        height: 160px;
        border-radius: 50%;
        margin-bottom: 20px;
        box-shadow: 0 0 15px #00ffff99;
      }
      .name {
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 6px;
      }
      .stats {
        font-size: 20px;
        color: #ccc;
        margin-bottom: 10px;
      }
      .rank {
        font-size: 18px;
        margin-bottom: 20px;
        color: #ffda66;
      }
      .bar {
        width: 500px;
        height: 30px;
        background: #3a3a3a;
        border-radius: 15px;
        position: relative;
        margin: auto;
      }
      .fill {
        width: ${barWidth}px;
        height: 30px;
        background: ${barColor};
        border-radius: 15px;
        box-shadow: 0 0 6px ${barColor}88;
      }
      .percent {
        position: absolute;
        left: 50%;
        top: 3px;
        transform: translateX(-50%);
        font-size: 16px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">💫 הפרופיל שלך</div>
      ${avatarDataURL ? `<img src="${avatarDataURL}" class="avatar" />` : ""}
      <div class="name">${fullName}</div>
      <div class="stats">XP: ${xp}/${nextXP} · רמה ${level}</div>
      <div class="rank">${stage}</div>
      <div class="bar">
        <div class="fill"></div>
        <div class="percent">${percentRounded}%</div>
      </div>
    </div>
  </body>
  </html>
  `;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 500 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };

const puppeteer = require("puppeteer");

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentRounded = Math.round(percent);
  const barWidth = Math.round(380 * (percent / 100));
  const barColor =
    percent < 40 ? "#e74c3c" : percent < 70 ? "#f9a825" : "#00e676";

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
          width: 700px;
          height: 300px;
          background: #1e1e2e;
          font-family: 'Varela Round', sans-serif;
          direction: rtl;
          color: #ffffff;
        }
        .container {
          display: flex;
          align-items: center;
          padding: 20px;
        }
        .avatar {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          margin-left: 30px;
          box-shadow: 0 0 12px #00ffff99;
        }
        .info {
          flex-grow: 1;
        }
        .title {
          font-size: 30px;
          color: #FFD700;
        }
        .name {
          font-size: 20px;
          margin-top: 6px;
        }
        .stats {
          font-size: 16px;
          margin: 4px 0 12px;
          color: #cccccc;
        }
        .rank {
          font-size: 16px;
          margin-bottom: 14px;
        }
        .bar-bg {
          width: 380px;
          height: 25px;
          background: #444;
          border-radius: 12px;
          position: relative;
        }
        .bar-fill {
          width: ${barWidth}px;
          height: 25px;
          background: ${barColor};
          border-radius: 12px;
        }
        .percent-text {
          position: absolute;
          top: 3px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${avatarDataURL ? `<img src="${avatarDataURL}" class="avatar" />` : ""}
        <div class="info">
          <div class="title">💫 הפרופיל שלך</div>
          <div class="name">${fullName}</div>
          <div class="stats">XP: ${xp}/${nextXP} · רמה ${level}</div>
          <div class="rank">${stage}</div>
          <div class="bar-bg">
            <div class="bar-fill"></div>
            <div class="percent-text">${percentRounded}%</div>
          </div>
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
  await page.setViewport({ width: 700, height: 300 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };

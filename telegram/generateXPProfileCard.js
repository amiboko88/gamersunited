const puppeteer = require("puppeteer");

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentRounded = Math.round(percent);
  const barWidth = Math.round(420 * (percent / 100));
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
          width: 760px;
          height: 340px;
          background: linear-gradient(135deg, #1a1a27, #101014);
          font-family: 'Varela Round', sans-serif;
          direction: rtl;
          color: #ffffff;
        }
        .container {
          display: flex;
          align-items: center;
          padding: 30px;
          background: #1f1f2e;
          box-shadow: 0 0 18px #00000066;
          border-radius: 18px;
          margin: 20px;
        }
        .avatar {
          width: 130px;
          height: 130px;
          border-radius: 50%;
          margin-left: 30px;
          box-shadow: 0 0 14px #00ffff99;
        }
        .info {
          flex-grow: 1;
        }
        .title {
          font-size: 36px;
          color: #FFD700;
          margin-bottom: 10px;
        }
        .name {
          font-size: 24px;
          margin-bottom: 6px;
        }
        .stats {
          font-size: 18px;
          color: #dddddd;
          margin-bottom: 8px;
        }
        .rank {
          font-size: 17px;
          margin-bottom: 18px;
        }
        .bar-bg {
          width: 420px;
          height: 28px;
          background: #333;
          border-radius: 14px;
          position: relative;
        }
        .bar-fill {
          width: ${barWidth}px;
          height: 28px;
          background: ${barColor};
          border-radius: 14px;
          box-shadow: 0 0 8px ${barColor}99;
        }
        .percent-text {
          position: absolute;
          top: 3px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 15px;
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
  await page.setViewport({ width: 760, height: 340 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };

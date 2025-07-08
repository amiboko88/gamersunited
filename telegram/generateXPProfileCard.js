const puppeteer = require("puppeteer");

function clean(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת\u200F\u200E\u202B\u202E]/gu, "")
    .trim();
}

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const name = clean(fullName);
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const barWidth = Math.round(500 * (percent / 100));
  const percentText = `${Math.round(percent)}%`;

  const barColor =
    percent < 40 ? "#e74c3c" : percent < 70 ? "#f9a825" : "#00e676";

  const stage =
    percent >= 100 ? "אגדי" :
    percent >= 90 ? "סופרסייאן" :
    percent >= 75 ? "כמעט שם" :
    percent >= 50 ? "מתאמן" :
    "טירון";

  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');

      body {
        margin: 0;
        width: 500px;
        height: 700px;
        background: radial-gradient(circle, #111118, #0a0a0f);
        font-family: "Segoe UI Emoji", "Noto Color Emoji", "Varela Round", sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        direction: rtl;
      }

      .card {
        width: 460px;
        padding: 40px 20px;
        background: #1e1e2e;
        border-radius: 28px;
        box-shadow: 0 0 30px #00000055;
        text-align: center;
      }

      .avatar {
        width: 130px;
        height: 130px;
        border-radius: 50%;
        border: 4px solid #FFD700;
        margin: 0 auto 20px;
        background-image: url("${avatarDataURL}");
        background-size: cover;
        background-position: center;
      }

      .name {
        font-size: 30px;
        font-weight: bold;
        margin-bottom: 6px;
        color: #ffffff;
      }

      .stats {
        font-size: 18px;
        color: #cccccc;
        margin-bottom: 10px;
      }

      .rank {
        font-size: 20px;
        color: #FFD700;
        margin-bottom: 30px;
      }

      .bar {
        position: relative;
        width: 500px;
        height: 34px;
        background: #3a3a3a;
        border-radius: 20px;
        margin: auto;
      }

      .fill {
        width: ${barWidth}px;
        height: 34px;
        border-radius: 20px;
        background: ${barColor};
        box-shadow: 0 0 8px ${barColor}88;
      }

      .percent {
        position: absolute;
        left: 50%;
        top: 4px;
        transform: translateX(-50%);
        font-size: 16px;
        font-weight: bold;
        color: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="avatar"></div>
      <div class="name">‏${name}</div>
      <div class="stats">XP: ${xp}/${nextXP} · רמה ${level}</div>
      <div class="rank">‏${stage}</div>
      <div class="bar">
        <div class="fill"></div>
        <div class="percent">${percentText}</div>
      </div>
    </div>
  </body>
  </html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 700, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };

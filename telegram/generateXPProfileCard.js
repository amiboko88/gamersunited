const puppeteer = require("puppeteer");

function clean(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N} _.\-@!?:א-ת]/gu, "")
    .trim();
}

async function generateXPProfileCard({ fullName, level, xp, avatarDataURL }) {
  const name = clean(fullName);
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const percentRounded = Math.round(percent);
  const barWidth = Math.round(580 * (percent / 100));
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
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');

        body {
          margin: 0;
          width: 900px;
          height: 420px;
          background: radial-gradient(circle, #101014, #0a0a0f);
          font-family: "Segoe UI Emoji", "Noto Color Emoji", "Varela Round", sans-serif;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card {
          width: 850px;
          padding: 40px 30px;
          background: #1d1d2d;
          border-radius: 28px;
          box-shadow: 0 0 24px #00000066;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 40px;
        }

        .avatar {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          box-shadow: 0 0 14px #00ffff99;
          flex-shrink: 0;
        }

        .info {
          flex-grow: 1;
          text-align: center;
        }

        .name {
          font-size: 30px;
          font-weight: bold;
          margin-bottom: 6px;
        }

        .stats {
          font-size: 20px;
          color: #cccccc;
          margin-bottom: 10px;
        }

        .rank {
          font-size: 18px;
          color: #FFD700;
          margin-bottom: 24px;
        }

        .bar {
          position: relative;
          width: 580px;
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
          top: 5px;
          transform: translateX(-50%);
          font-size: 15px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="card">
        ${avatarDataURL ? `<img src="${avatarDataURL}" class="avatar" />` : ""}
        <div class="info">
          <div class="name">${name}</div>
          <div class="stats">XP: ${xp}/${nextXP} · רמה ${level}</div>
          <div class="rank">${stage}</div>
          <div class="bar">
            <div class="fill"></div>
            <div class="percent">${percentRounded}%</div>
          </div>
        </div>
      </div>
    </body>
  </html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 420 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { generateXPProfileCard };

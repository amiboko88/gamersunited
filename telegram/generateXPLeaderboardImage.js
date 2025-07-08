const puppeteer = require("puppeteer");

function getBarColor(percent) {
  if (percent < 40) return "#e74c3c";
  if (percent < 70) return "#f9a825";
  return "#00e676";
}

async function createLeaderboardImage(users) {
  const rowsHTML = users.map((u, i) => {
    const level = u.level || 1;
    const xp = u.xp || 0;
    const name = u.fullName || u.username || "אנונימי";
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const percentText = `${Math.round(percent * 100)}%`;
    const barColor = getBarColor(percent);
    const barWidth = Math.floor(420 * percent);

    return `
    <div class="row">
      <div class="rank">#${i + 1}</div>
      <div class="info">
        <div class="name">${name}</div>
        <div class="xp">XP: ${xp}/${nextXP} · רמה ${level}</div>
        <div class="bar">
          <div class="fill" style="width: ${barWidth}px; background: ${barColor}; box-shadow: 0 0 8px ${barColor}88;"></div>
          <div class="percent">${percentText}</div>
        </div>
      </div>
    </div>`;
  }).join("\n");

  const html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0;
          background: radial-gradient(circle at top, #151621, #0b0c10);
          font-family: 'Varela Round', sans-serif;
          direction: rtl;
          color: #ffffff;
          width: 1000px;
        }
        .header {
          font-size: 48px;
          color: #FFD700;
          text-align: center;
          padding: 40px 0 30px;
          text-shadow: 0 0 10px #ffd70088;
        }
        .container {
          width: 900px;
          margin: 0 auto 60px;
          background: #1f1f2e;
          border-radius: 22px;
          box-shadow: 0 0 30px #00000055;
          padding: 30px 40px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #252537;
          margin: 12px 0;
          padding: 18px 24px;
          border-radius: 16px;
        }
        .row:nth-child(even) {
          background: #2c2c41;
        }
        .rank {
          font-size: 28px;
          width: 60px;
          text-align: center;
          color: #FFD700;
          font-weight: bold;
        }
        .info {
          flex-grow: 1;
          text-align: center;
        }
        .name {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 6px;
        }
        .xp {
          font-size: 16px;
          color: #cccccc;
          margin-bottom: 10px;
        }
        .bar {
          position: relative;
          background: #3a3a3a;
          border-radius: 14px;
          height: 30px;
          width: 420px;
          margin: auto;
        }
        .fill {
          height: 30px;
          border-radius: 14px;
        }
        .percent {
          position: absolute;
          left: 50%;
          top: 3px;
          transform: translateX(-50%);
          font-size: 15px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="header">🏆 מצטייני XP השבוע</div>
      <div class="container">
        ${rowsHTML}
      </div>
    </body>
  </html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 1000,
    height: 250 + users.length * 120,
    deviceScaleFactor: 2
  });

  await page.setContent(html, { waitUntil: "networkidle0" });
  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { createLeaderboardImage };

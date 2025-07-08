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
    const barWidth = Math.floor(360 * percent);

    return `
      <div class="row">
        <div class="rank">#${i + 1}</div>
        <div class="info">
          <div class="name">${name}</div>
          <div class="xp">XP: ${xp}/${nextXP} · רמה ${level}</div>
          <div class="bar">
            <div class="fill" style="width: ${barWidth}px; background: ${barColor}; box-shadow: 0 0 6px ${barColor}88;"></div>
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
          background: linear-gradient(120deg, #151621, #0d0d13);
          font-family: 'Varela Round', sans-serif;
          direction: rtl;
          color: #ffffff;
          width: 1000px;
        }
        .header {
          font-size: 50px;
          color: #FFD700;
          text-align: center;
          padding: 40px 0 30px;
          text-shadow: 0 0 6px #ffd70055;
        }
        .container {
          margin: auto;
          width: 900px;
          padding: 20px 30px;
          background: #1b1b2b;
          border-radius: 20px;
          box-shadow: 0 0 30px #00000066;
        }
        .row {
          display: flex;
          flex-direction: row;
          align-items: center;
          background: #232335;
          margin: 10px 0;
          padding: 18px 24px;
          border-radius: 16px;
        }
        .row:nth-child(even) {
          background: #27273c;
        }
        .rank {
          font-size: 30px;
          font-weight: bold;
          width: 60px;
          text-align: center;
          color: #FFD700;
        }
        .info {
          flex-grow: 1;
        }
        .name {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 6px;
          color: #ffffff;
        }
        .xp {
          font-size: 16px;
          color: #cccccc;
          margin-bottom: 10px;
        }
        .bar {
          position: relative;
          background: #3a3a3a;
          border-radius: 10px;
          height: 28px;
          width: 360px;
          overflow: hidden;
        }
        .fill {
          height: 28px;
          border-radius: 10px;
        }
        .percent {
          position: absolute;
          left: 50%;
          top: 3px;
          transform: translateX(-50%);
          font-size: 14px;
          font-weight: bold;
          color: #ffffff;
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
    height: 200 + users.length * 120,
    deviceScaleFactor: 2
  });

  await page.setContent(html, { waitUntil: "networkidle0" });
  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { createLeaderboardImage };

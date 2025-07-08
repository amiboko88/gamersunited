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
    const barWidth = Math.floor(300 * percent);

    return `
    <div class="row">
      <div class="rank">#${i + 1}</div>
      <div class="info">
        <div class="name">${name}</div>
        <div class="xp">XP: ${xp}/${nextXP} · רמה ${level}</div>
        <div class="bar">
          <div class="fill" style="width: ${barWidth}px; background: ${barColor};"></div>
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
          background: #101014;
          color: #fff;
          font-family: 'Varela Round', sans-serif;
          width: 900px;
        }
        .header {
          font-size: 42px;
          color: #FFD700;
          text-align: right;
          padding: 30px 40px 10px;
        }
        .row {
          display: flex;
          flex-direction: row;
          padding: 10px 40px;
          background: #1a1a27;
          margin: 6px 0;
          align-items: center;
        }
        .row:nth-child(even) {
          background: #1e1e2e;
        }
        .rank {
          font-size: 28px;
          width: 60px;
          text-align: center;
        }
        .info {
          flex-grow: 1;
        }
        .name {
          font-size: 20px;
        }
        .xp {
          font-size: 15px;
          color: #ccc;
          margin-bottom: 6px;
        }
        .bar {
          position: relative;
          background: #444;
          border-radius: 8px;
          height: 25px;
          width: 300px;
        }
        .fill {
          height: 25px;
          border-radius: 8px;
        }
        .percent {
          position: absolute;
          left: 50%;
          top: 3px;
          transform: translateX(-50%);
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="header">🏆 טבלת מצטייני XP</div>
      ${rowsHTML}
    </body>
  </html>
  `;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 900,
    height: 120 + users.length * 100,
    deviceScaleFactor: 2
  });

  await page.setContent(html, { waitUntil: "networkidle0" });
  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { createLeaderboardImage };

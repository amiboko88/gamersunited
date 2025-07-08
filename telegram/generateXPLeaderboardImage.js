const puppeteer = require("puppeteer");

function sanitizeName(text) {
  const allowedEmojis = /[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu;
  const controlChars = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2060-\u206F]/g;
  const cleanChars = /[^\p{L}\p{N} _.\-@!?א-ת]/gu;

  const cleaned = (text || "")
    .replace(controlChars, "")
    .replace(cleanChars, (char) => allowedEmojis.test(char) ? char : "")
    .trim();

  return cleaned.length > 0 ? cleaned : "אנונימי";
}

function getBarColor(percent) {
  if (percent < 40) return "#e74c3c";
  if (percent < 70) return "#f9a825";
  return "#00e676";
}

async function createLeaderboardImage(users) {
  const rowsHTML = users.map((u, i) => {
    const level = u.level || 1;
    const xp = u.xp || 0;
    const name = sanitizeName(u.fullName || u.username || "אנונימי");
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
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');
      body {
        margin: 0;
        background: radial-gradient(circle at top, #151621, #0b0c10);
        font-family: "Segoe UI Emoji", "Noto Color Emoji", "Varela Round", sans-serif;
        direction: rtl;
        color: #ffffff;
        width: 1000px;
      }
      .title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-top: 30px;
        margin-bottom: 20px;
        color: #FFD700;
      }
      .container {
        width: 920px;
        margin: 20px auto 40px;
        background: #1f1f2e;
        border-radius: 26px;
        box-shadow: 0 0 28px #00000066;
        padding: 30px 40px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #2a2a3a;
        margin: 14px 0;
        padding: 20px;
        border-radius: 20px;
      }
      .row:nth-child(even) {
        background: #303046;
      }
      .rank {
        font-size: 26px;
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
        word-break: break-word;
      }
      .xp {
        font-size: 16px;
        color: #cccccc;
        margin-bottom: 10px;
      }
      .bar {
        position: relative;
        background: #3a3a3a;
        border-radius: 16px;
        height: 30px;
        width: 420px;
        margin: auto;
      }
      .fill {
        height: 30px;
        border-radius: 16px;
      }
      .percent {
        position: absolute;
        left: 50%;
        top: 4px;
        transform: translateX(-50%);
        font-size: 15px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="title">‏🏆 טבלת מצטיינים</div>
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
  const rowHeight = 140;
  const totalHeight = 100 + users.length * rowHeight;

  await page.setViewport({
    width: 1000,
    height: totalHeight,
    deviceScaleFactor: 2
  });

  await page.setContent(html, { waitUntil: "networkidle0" });
  const buffer = await page.screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

module.exports = { createLeaderboardImage };

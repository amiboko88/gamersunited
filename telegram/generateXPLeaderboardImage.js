const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// 🟢 טעינת פונט עברי
registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "HebrewBold"
});

function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c";
  if (percent < 0.7) return "#f9a825";
  return "#00e676";
}

function drawText(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

async function createLeaderboardImage(users) {
  const width = 900;
  const rowHeight = 100;
  const headerHeight = 110;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, width, height);

  // 🥇 כותרת עם תמונת מדליה
  const medalImg = await loadImage(path.join(__dirname, "../assets/gold_medal.png"));
  ctx.drawImage(medalImg, width - 110, 22, 40, 40); // ציור מדליה

  ctx.font = "bold 42px HebrewBold";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText("‏טבלת מצטיינים", width - 160, 55);

  // 👥 רשימת משתמשים
  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const percentText = `${Math.round(percent * 100)}%`;
    const barColor = getBarColor(percent);

    const name = `${u.fullName || u.username || "אנונימי"}`;
    const xpDisplay = `‏XP: ${xp}/${nextXP} · רמה ${level}`;

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#1a1a27" : "#1e1e2e";
    ctx.fillRect(40, y, width - 80, rowHeight - 12);

    // בר התקדמות
    const barX = 70;
    const barY = y + 30;
    const barW = 300;
    const barH = 36;
    const fillW = Math.floor(barW * percent);

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    // אחוז בתוך הבר
    ctx.font = "bold 15px HebrewBold";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(percentText, barX + barW / 2, barY + 24);

    // שם משתמש
    drawText(ctx, `‏${name}`, width - 90, y + 35, "bold 24px HebrewBold");

    // XP מפושט, יושב נכון
    drawText(ctx, xpDisplay, width - 90, y + 66, "16px HebrewBold");
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

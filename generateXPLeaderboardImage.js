// 📁 generateXPLeaderboardImage.js
const { createCanvas } = require("canvas");

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";
  if (percent < 0.7) return "#ffaa00";
  return "#00cc99";
}

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#000000aa";
  ctx.fillText(text, x + 2, y + 2); // shadow
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 720;
  const rowHeight = 70;
  const headerHeight = 100;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע כללי
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  // כותרת עם קו
  drawTextWithShadow(ctx, "📈 טבלת מצטייני XP", width / 2, 55, "bold 34px sans-serif", "center");
  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(60, 70);
  ctx.lineTo(width - 60, 70);
  ctx.stroke();

  // שורות המשתמשים
  users.forEach((u, i) => {
    const yTop = headerHeight + i * rowHeight;
    const isEven = i % 2 === 0;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barColor = getBarColor(percent);
    const fill = Math.floor(percent * 200);

    // רקע שורה
    ctx.fillStyle = isEven ? "#262638" : "#2e2e45";
    ctx.fillRect(30, yTop, width - 60, rowHeight - 10);

    // מדליה TOP 3
    const badgeColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
    if (i < 3) {
      ctx.fillStyle = badgeColors[i];
      ctx.beginPath();
      ctx.arc(width - 50, yTop + 30, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // שם
    const name = `${u.fullName || u.username || "אנונימי"}`;
    drawTextWithShadow(ctx, `🧠 ${name}`, width - 90, yTop + 30, "bold 22px sans-serif");

    // רמה ו־XP
    drawTextWithShadow(
      ctx,
      `🏅 רמה ${level} – ${xp} XP`,
      width - 90,
      yTop + 55,
      "18px sans-serif"
    );

    // בר התקדמות
    const barX = 60;
    const barY = yTop + 45;
    const barW = 200;
    const barH = 18;

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fill, barH);

    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

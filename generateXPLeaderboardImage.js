// 📁 generateXPLeaderboardImage.js
const { createCanvas } = require("canvas");

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";   // אדום
  if (percent < 0.7) return "#ffaa00";   // כתום
  return "#00cc99";                      // ירוק
}

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#00000088";
  ctx.fillText(text, x + 2, y + 2); // צל
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 800;
  const rowHeight = 80;
  const headerHeight = 90;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע כללי
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  ctx.direction = "rtl";
  drawTextWithShadow(ctx, "📊 טבלת מצטייני XP", width - 30, 55, "bold 32px sans-serif");

  // קו מפריד
  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(30, 70);
  ctx.lineTo(width - 30, 70);
  ctx.stroke();

  // שורות משתמשים
  users.forEach((u, i) => {
    const yTop = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barColor = getBarColor(percent);
    const fill = Math.max(1, Math.floor(percent * 250));

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2a2a40" : "#292940";
    ctx.fillRect(25, yTop, width - 50, rowHeight - 10);

    // שם + רמה
    const name = `${u.fullName || u.username || "אנונימי"}`;
    drawTextWithShadow(ctx, `רמה ${level} – ${name}`, width - 40, yTop + 30, "bold 22px sans-serif");

    // XP מתוך XP
    drawTextWithShadow(ctx, `XP ${xp} מתוך ${nextXP}`, width - 40, yTop + 55, "18px sans-serif");

    // בר התקדמות
    const barX = 40;
    const barY = yTop + 40;
    const barW = 250;
    const barH = 20;

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fill, barH);

    ctx.strokeStyle = "#888";
    ctx.strokeRect(barX, barY, barW, barH);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

// 📁 generateXPLeaderboardImage.js
const { createCanvas } = require("canvas");

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";     // אדום
  if (percent < 0.7) return "#ffaa00";     // כתום
  if (percent < 0.9) return "#ffff66";     // צהוב
  return "#00cc99";                        // ירוק
}

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#00000055";
  ctx.fillText(text, x + 2, y + 2); // צל
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 800;
  const rowHeight = 80;
  const headerHeight = 100;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע כללי
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  drawTextWithShadow(ctx, "📈 טבלת מצטייני XP", width - 40, 55, "bold 36px Arial", "right");
  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(40, 70);
  ctx.lineTo(width - 40, 70);
  ctx.stroke();

  // ציור שורות
  users.forEach((u, i) => {
    const yTop = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barColor = getBarColor(percent);
    const barFill = Math.floor(percent * 300);

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2a2a3a" : "#29293d";
    ctx.fillRect(30, yTop, width - 60, rowHeight - 10);

    // טקסט שמאלי – XP מתוך XP
    drawTextWithShadow(
      ctx,
      `${xp} מתוך ${nextXP} XP`,
      width - 60,
      yTop + 55,
      "20px Arial"
    );

    // טקסט ימני – רמה ושם
    const name = `${u.fullName || u.username || "אנונימי"}`;
    drawTextWithShadow(
      ctx,
      `רמה ${level} – ${name}`,
      width - 60,
      yTop + 30,
      "bold 24px Arial"
    );

    // פס התקדמות
    const barX = 50;
    const barY = yTop + 45;
    const barW = 300;
    const barH = 20;

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barFill, barH);
    ctx.strokeStyle = "#888";
    ctx.strokeRect(barX, barY, barW, barH);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

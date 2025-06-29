const { createCanvas } = require("canvas");

function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c";     // אדום
  if (percent < 0.7) return "#f39c12";     // כתום
  return "#2ecc71";                        // ירוק
}

function drawText(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 760;
  const rowHeight = 90;
  const headerHeight = 100;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע
  ctx.fillStyle = "#1f1f2f";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  ctx.font = "bold 36px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("טבלת מצטייני XP", width / 2, 55);

  // שורות
  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barColor = getBarColor(percent);
    const percentText = `${Math.round(percent * 100)}%`;

    const name = `${u.fullName || u.username || "אנונימי"}`;
    const xpDisplay = `${xp} מתוך ${nextXP} XP`;

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2b2b3b" : "#262636";
    ctx.fillRect(30, y, width - 60, rowHeight - 10);

    // בר התקדמות
    const barX = 60;
    const barY = y + 20;
    const barW = 280;
    const barH = 26;
    const fillW = Math.floor(barW * percent);

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(percentText, barX + barW / 2, barY + 18);

    // טקסט – שם
    drawText(ctx, name, width - 90, y + 30, "bold 22px sans-serif");

    // טקסט – רמה + XP
    drawText(ctx, `רמה ${level} | ${xpDisplay}`, width - 90, y + 60, "18px sans-serif");
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

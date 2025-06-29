const { createCanvas } = require("canvas");

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";     // אדום
  if (percent < 0.7) return "#f7b731";     // כתום
  return "#2ecc71";                        // ירוק
}

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#00000066";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 760;
  const rowHeight = 85;
  const headerHeight = 110;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע
  ctx.fillStyle = "#1e1e2f";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  drawTextWithShadow(ctx, "📊 טבלת מצטייני XP", width / 2, 55, "bold 34px sans-serif", "center");
  ctx.strokeStyle = "#ffffff22";
  ctx.beginPath();
  ctx.moveTo(60, 70);
  ctx.lineTo(width - 60, 70);
  ctx.stroke();

  // שורות
  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const percentText = `${Math.round(percent * 100)}%`;
    const name = `${u.fullName || u.username || "אנונימי"}`;
    const barColor = getBarColor(percent);

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2c2c3d" : "#242436";
    ctx.fillRect(30, y, width - 60, rowHeight - 10);

    // שם
    drawTextWithShadow(ctx, `🧠 ${name}`, width - 90, y + 30, "bold 22px sans-serif");

    // רמה
    drawTextWithShadow(ctx, `🏅 רמה ${level} | ${xp} XP`, width - 90, y + 58, "18px sans-serif");

    // בר התקדמות
    const barX = 60;
    const barY = y + 40;
    const barW = 280;
    const barH = 24;
    const fillW = Math.floor(barW * percent);

    // מסגרת
    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    // מילוי
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    // אחוזים
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(percentText, barX + barW / 2, barY + 17);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

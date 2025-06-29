// 📁 generateXPLeaderboardImage.js
const { createCanvas, registerFont } = require("canvas");
const path = require("path");

// רישום גופנים (מתוך assets)
registerFont(path.join(__dirname, "assets", "NotoSansHebrew-Bold.ttf"), { family: "Hebrew", weight: "bold" });

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";      // אדום
  if (percent < 0.7) return "#ffaa00";      // כתום
  return "#00cc99";                         // ירוק
}

function drawText(ctx, text, x, y, font, color = "#fff", align = "right") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 800;
  const rowHeight = 85;
  const headerHeight = 90;
  const height = headerHeight + users.length * rowHeight + 20;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  drawText(ctx, "טבלת מצטייני XP", width - 40, 50, "bold 36px Hebrew");

  // שורות המשתמשים
  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2b2b3d" : "#2a2a39";
    ctx.fillRect(40, y, width - 80, rowHeight - 10);

    // טקסט שם ורמה
    drawText(ctx, `${u.fullName || u.username || "אנונימי"} – רמה ${level}`, width - 60, y + 30, "bold 24px Hebrew");

    // XP
    drawText(ctx, `XP ${xp} מתוך ${nextXP}`, width - 60, y + 58, "20px Hebrew", "#ccc");

    // בר התקדמות
    const barX = 60;
    const barY = y + 55;
    const barW = 220;
    const barH = 18;
    const fillW = Math.floor(barW * percent);

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = getBarColor(percent);
    ctx.fillRect(barX, barY, fillW, barH);

    ctx.strokeStyle = "#333";
    ctx.strokeRect(barX, barY, barW, barH);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

// 📁 generateXPLeaderboardImage.js
const { createCanvas, registerFont } = require("canvas");
const path = require("path");

// הרשמה לפונטים בעברית אם זמינים
try {
  registerFont(path.join(__dirname, "assets/NotoSansHebrew-Bold.ttf"), { family: "HebrewBold" });
  registerFont(path.join(__dirname, "assets/DejaVuSans-Bold.ttf"), { family: "LatinBold" });
  registerFont(path.join(__dirname, "assets/DejaVuSans.ttf"), { family: "Latin" });
} catch (err) {
  console.warn("⚠️ לא נטענו כל הפונטים, משתמשים בברירת מחדל.");
}

function getBarColor(percent) {
  if (percent < 0.4) return "#ff4d4d";     // אדום
  if (percent < 0.7) return "#ffaa00";     // כתום
  return "#00ccff";                        // תכלת
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.font = options.font || "24px HebrewBold";
  ctx.fillStyle = options.color || "white";
  ctx.textAlign = options.align || "right";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 800;
  const padding = 30;
  const rowHeight = 100;
  const headerHeight = 100;
  const barWidth = 500;
  const barHeight = 20;

  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  ctx.font = "bold 36px HebrewBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.fillText("טבלת מצטייני XP", width / 2, 55);

  // קו תחתון לכותרת
  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(padding, 80);
  ctx.lineTo(width - padding, 80);
  ctx.stroke();

  // שורות משתמשים
  users.forEach((u, i) => {
    const yTop = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barColor = getBarColor(percent);
    const fill = Math.floor(barWidth * percent);

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2a2a3d" : "#262636";
    ctx.fillRect(padding, yTop, width - padding * 2, rowHeight - 10);

    // שם + רמה
    const name = `${u.fullName || u.username || "אנונימי"}`;
    drawText(ctx, `רמה ${level} – ${name}`, width - padding - 20, yTop + 35, {
      font: "bold 26px HebrewBold",
    });

    // XP
    drawText(ctx, `${xp} מתוך ${nextXP} XP`, width - padding - 20, yTop + 65, {
      font: "22px HebrewBold",
      color: "#cccccc",
    });

    // מד התקדמות
    const barX = padding + 20;
    const barY = yTop + 60;
    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fill, barHeight);
    ctx.strokeStyle = "#888";
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };

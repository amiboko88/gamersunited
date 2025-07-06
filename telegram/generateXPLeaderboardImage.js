const { createCanvas, registerFont } = require("canvas");
const path = require("path");

// 🔤 הרשמת פונט עברי
registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "HebrewBold"
});

function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c"; // אדום
  if (percent < 0.7) return "#f9a825"; // כתום
  return "#00e676"; // ירוק
}

function drawText(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 900;
  const rowHeight = 100;
  const headerHeight = 120;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 🎨 רקע ראשי
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, width, height);

  // 🏆 כותרת
  ctx.font = "bold 42px HebrewBold";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText("‏🏆 טבלת מצטייני XP", width - 60, 70);

  // 🔁 ציור כל שורה
  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const percentText = `${Math.round(percent * 100)}%`;
    const barColor = getBarColor(percent);

    const name = `${u.fullName || u.username || "אנונימי"}`;
    const xpDisplay = `רמה ${level} · ${xp} מתוך ${nextXP} XP`;

    // 🟦 רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#1a1a27" : "#1e1e2e";
    ctx.fillRect(40, y, width - 80, rowHeight - 12);

    // 📊 בר התקדמות
    const barX = 70;
    const barY = y + 25;
    const barW = 300;
    const barH = 28;
    const fillW = Math.floor(barW * percent);

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    // אחוז בצד ימין של הבר
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(percentText, barX + barW + 10, barY + 20);

    // שם המשתמש
    drawText(ctx, name, width - 90, y + 35, "bold 24px HebrewBold");

    // XP + רמה
    drawText(ctx, xpDisplay, width - 90, y + 70, "18px HebrewBold");
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };
